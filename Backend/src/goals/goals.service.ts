import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { Goal, Memory } from '@prisma/client';
import { GOAL_DELTA } from '../affection/affection';
import { AffectionService } from '../affection/affection.service';
import type { AffectionView } from '../affection/affection.service';
import { AppException } from '../common/app.exception';
import { ErrorCode } from '../common/error-codes';
import { FocusService } from '../focus/focus.service';
import { isStoredMediaPath } from '../media/media-paths';
import { readVisibility } from '../memories/memories.service';
import type { MemoryVisibility } from '../memories/memories.service';
import { PrismaService } from '../prisma/prisma.service';
import { GOAL_LIMIT_MESSAGE, MAX_OPEN_GOALS } from './goal-limit';

/**
 * What finishing a goal hands back: the goal, and what it did to the creature.
 *
 * The delta is computed here rather than by the client subtracting two values
 * it happens to be holding, and that is not fussiness — gains are scaled by how
 * much room is left above the current value (`affection.ts:applyDelta`), so the
 * same goal is worth less to a creature that already adores you. Only the code
 * that applied it knows what it was actually worth.
 */
export interface GoalCompletionView extends GoalView {
  affection: AffectionView;
  /**
   * Percentage points gained, for the completion celebration.
   *
   * Whole points, because it is shown to a person as "+5 Happiness". Never
   * negative: a completion cannot cost affection, and a rounding artefact that
   * printed "+0" would read as a bug.
   */
  affectionGained: number;
}

/** What the API hands back for a goal. */
export interface GoalView {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'completed';
  createdAt: string;
  completedAt: string | null;
  /** The memory kept when it was finished, if the user kept one. */
  memory: GoalMemoryView | null;
}

export interface GoalMemoryView {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  /** Whether the user chose to show this one to visitors. */
  visibility: MemoryVisibility;
  createdAt: string;
}

type GoalWithMemory = Goal & { memory: Memory | null };

function toMemoryView(memory: Memory): GoalMemoryView {
  return {
    id: memory.id,
    title: memory.title,
    description: memory.description,
    imageUrl: memory.imageUrl,
    visibility: readVisibility(memory.visibility),
    createdAt: memory.createdAt.toISOString(),
  };
}

function toView(goal: GoalWithMemory): GoalView {
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    status: goal.status === 'completed' ? 'completed' : 'open',
    createdAt: goal.createdAt.toISOString(),
    completedAt: goal.completedAt?.toISOString() ?? null,
    memory: goal.memory ? toMemoryView(goal.memory) : null,
  };
}

/**
 * Goals — the link between real life and the room.
 *
 * Scoped exactly the way pets and environments are: every method takes the
 * session user's id as its first argument, nothing reads an owner from a
 * request body, and a goal belonging to somebody else is reported as 404 rather
 * than 403 so the API never confirms that an id exists.
 *
 * Two rules live here rather than in the client, because a rule that only
 * exists in a React component is a suggestion:
 *
 *   the six-goal cap    counted inside the same transaction that inserts, so
 *                       two tabs racing cannot make a seventh
 *   completion          one transaction: the goal changes status and the
 *                       memory is written, or neither happens
 *
 * And one that arrived with focus sessions: **a goal being worked on right now
 * cannot be finished, reopened or deleted.** Not tidiness - the room is dark
 * and the creature is asleep because of that goal, and deleting it would leave
 * the user in a room they cannot turn the lights back on in.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly focus: FocusService,
    private readonly affection: AffectionService,
  ) {}

  async list(
    ownerId: string,
    status: 'open' | 'completed' | 'all' = 'all',
  ): Promise<GoalView[]> {
    const goals = await this.prisma.goal.findMany({
      where: { ownerId, ...(status === 'all' ? {} : { status }) },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { memory: true },
    });

    return goals.map(toView);
  }

  /** How many more the user may add. Drives the interface, and only the interface. */
  async openCount(ownerId: string): Promise<number> {
    return this.prisma.goal.count({ where: { ownerId, status: 'open' } });
  }

  /**
   * Add a goal, unless the user already has six open.
   *
   * The count and the insert share a transaction. Without one, two requests
   * that both counted five would both insert, and the user would end up with
   * seven — which is exactly the kind of bug that only appears once the feature
   * is popular enough for somebody to double-click.
   */
  async create(
    ownerId: string,
    input: { title: string; description?: string },
  ): Promise<GoalView> {
    const goal = await this.prisma.$transaction(async (tx) => {
      const open = await tx.goal.count({ where: { ownerId, status: 'open' } });

      if (open >= MAX_OPEN_GOALS) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.GOAL_LIMIT_REACHED,
          GOAL_LIMIT_MESSAGE,
        );
      }

      return tx.goal.create({
        data: {
          ownerId,
          title: input.title.trim(),
          description: input.description?.trim() ?? '',
        },
        include: { memory: true },
      });
    });

    return toView(goal);
  }

  async findOne(ownerId: string, goalId: string): Promise<GoalView> {
    return toView(await this.owned(ownerId, goalId));
  }

  async update(
    ownerId: string,
    goalId: string,
    input: { title?: string; description?: string },
  ): Promise<GoalView> {
    await this.owned(ownerId, goalId);

    const updated = await this.prisma.goal.update({
      where: { id: goalId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim() }
          : {}),
      },
      include: { memory: true },
    });

    return toView(updated);
  }

  /**
   * Finish a goal, and keep what the user chose to remember about it.
   *
   * Both halves in one transaction, so the state the user is left in is never
   * ambiguous: either the goal is done and the memory exists, or nothing
   * changed and they can try again. The picture is optional and so is the
   * memory — completing with no body at all is the ordinary case.
   *
   * Completing something already completed is not an error. The client may have
   * retried a request whose response it never saw, and `Memory.goalId` is
   * unique, so the second attempt returns the first attempt's result rather
   * than making a second memory.
   */
  async complete(
    ownerId: string,
    goalId: string,
    input: {
      memory?: {
        title?: string;
        description?: string;
        imageUrl?: string;
        visibility?: MemoryVisibility;
      };
    } = {},
  ): Promise<GoalCompletionView> {
    const existing = await this.owned(ownerId, goalId);

    // Already done. A retried request is not a second celebration, so the gain
    // it reports is zero rather than the one the first attempt earned.
    if (existing.status === 'completed') {
      return {
        ...toView(existing),
        affection: await this.affection.read(ownerId),
        affectionGained: 0,
      };
    }

    await this.notMidSession(
      ownerId,
      goalId,
      'You are in the middle of a session on this one. Let the time run out, or ' +
        'step away from it first.',
    );

    const image = input.memory?.imageUrl;
    if (image !== undefined && !isStoredMediaPath(image)) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        'memory.imageUrl must be a path returned by the media endpoints.',
      );
    }

    const before = (await this.affection.read(ownerId)).value;

    const { goal: completed, affection } = await this.prisma.$transaction(async (tx) => {
      const goal = await tx.goal.update({
        where: { id: goalId },
        data: { status: 'completed', completedAt: new Date() },
      });

      let shared = 0;

      if (input.memory) {
        // Private unless this completion said otherwise. The default lives
        // in three places that agree — here, the column, and the migration
        // — because this is the setting that must never fail open.
        const visibility = input.memory.visibility ?? 'private';

        await tx.memory.create({
          data: {
            ownerId,
            goalId: goal.id,
            type: 'goal_completed',
            title: (input.memory.title?.trim() || goal.title).slice(0, 120),
            description: input.memory.description?.trim() ?? '',
            imageUrl: image ?? null,
            visibility,
          },
        });

        // Publishing from the completion dialog counts exactly as publishing
        // from the memory book does. It is the same act, and a user who found
        // the switch in one place should not have a different number from one
        // who found it in the other.
        if (visibility === 'public') shared = 1;
      }

      // The largest single thing that happens to the relationship, and it belongs
      // in this transaction rather than after it: a completion the creature did not
      // notice is a completion the product did not record.
      //
      // Its return value is the new value. Reading it again after the transaction
      // was a third `User.findUnique` for a number this call already produced.
      const applied = await this.affection.apply(tx, ownerId, GOAL_DELTA, {
        followedThrough: true,
        // The counters the object catalog is unlocked against, moved in the
        // same statement and therefore under the same all-or-nothing as the
        // completion itself (`progress/progress.ts`). The early return above
        // is what makes this exactly-once: a retried completion never reaches
        // here, so a double-clicked button cannot count a goal twice.
        progress: { goalsCompleted: 1, memoriesShared: shared },
      });

      return {
        goal: await tx.goal.findUniqueOrThrow({
          where: { id: goal.id },
          include: { memory: true },
        }),
        affection: applied,
      };
    });

    return {
      ...toView(completed),
      affection,
      affectionGained: Math.max(0, Math.round((affection.value - before) * 100)),
    };
  }

  /**
   * Undo a completion.
   *
   * The memory stays. It is a record of a day, not a property of the task, and
   * quietly deleting the picture somebody kept because they reopened a checkbox
   * would be the worst kind of tidy. It does lose its link — `Memory.goalId` is
   * unique, so leaving it attached would stop the goal ever being completed
   * again.
   */
  async reopen(ownerId: string, goalId: string): Promise<GoalView> {
    const existing = await this.owned(ownerId, goalId);
    if (existing.status === 'open') return toView(existing);

    const open = await this.prisma.$transaction(async (tx) => {
      const count = await tx.goal.count({ where: { ownerId, status: 'open' } });
      if (count >= MAX_OPEN_GOALS) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.GOAL_LIMIT_REACHED,
          GOAL_LIMIT_MESSAGE,
        );
      }

      if (existing.memory) {
        await tx.memory.update({
          where: { id: existing.memory.id },
          data: { goalId: null },
        });
      }

      // Give the affection back. Not as a punishment for changing your mind -
      // it is the same event running backwards, and without it a checkbox
      // pressed forty times is a creature that adores you for nothing.
      //
      // It does not land exactly where it started, and that is the useful part:
      // gains are scaled by the room above and losses by the value below
      // (`affection.ts`), so a complete/reopen cycle costs a fraction of a
      // percent. Churning slowly loses; doing the thing wins.
      await this.affection.apply(tx, ownerId, -GOAL_DELTA, {
        // And the count goes back with it, for the same reason. Without the
        // decrement, complete/reopen pressed twenty times is the whole locked
        // catalog in a minute — a progress bar you can scrub is not progress.
        // The memory keeps its visibility, so `memoriesShared` does not move:
        // taking a goal back is not un-sharing the photograph.
        progress: { goalsCompleted: -1 },
      });

      return tx.goal.update({
        where: { id: goalId },
        data: { status: 'open', completedAt: null },
        include: { memory: true },
      });
    });

    return toView(open);
  }

  /**
   * Delete a goal.
   *
   * Its memory survives, unlinked — see `reopen`. So do its finished sessions:
   * `FocusSession.goalId` is nullable with ON DELETE SET NULL, because an
   * afternoon somebody actually spent is not undone by tidying up the list it
   * was on.
   */
  async remove(ownerId: string, goalId: string): Promise<void> {
    await this.owned(ownerId, goalId);
    await this.notMidSession(
      ownerId,
      goalId,
      'That one is being worked on right now. Step away from the session first.',
    );
    await this.prisma.goal.delete({ where: { id: goalId } });
  }

  /**
   * Refuse anything that would pull a goal out from under a running session.
   *
   * Asking the focus service rather than the table directly is deliberate: its
   * `current` resolves sessions whose time ran out while the app was closed, so
   * a goal whose session finished last night is *not* mid-session and can be
   * finished the moment the user comes back.
   */
  private async notMidSession(
    ownerId: string,
    goalId: string,
    message: string,
  ): Promise<void> {
    if ((await this.focus.activeGoalId(ownerId)) !== goalId) return;

    throw new AppException(HttpStatus.CONFLICT, ErrorCode.FOCUS_IN_PROGRESS, message);
  }

  /**
   * Fetch a goal, or 404.
   *
   * Scoped by owner in the query itself rather than fetched and then checked,
   * so there is no version of this that forgets the check.
   */
  private async owned(ownerId: string, goalId: string): Promise<GoalWithMemory> {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, ownerId },
      include: { memory: true },
    });

    if (!goal) throw new NotFoundException('Goal not found');
    return goal;
  }
}
