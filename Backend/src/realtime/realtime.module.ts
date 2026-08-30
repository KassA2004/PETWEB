import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { FriendsModule } from '../friends/friends.module';
import { ParksModule } from '../parks/parks.module';
import { SocialGateway } from './social.gateway';
import { SocialBusModule } from './social-bus';

/**
 * The socket half of the social layer.
 *
 * This module is the top of the dependency order and nothing imports it, which
 * is what keeps the graph acyclic:
 *
 * ```text
 *   SocialBusModule            (no imports at all)
 *        ▲        ▲
 *   ChatModule  FriendsModule  ParksModule
 *        ▲        ▲              ▲
 *        └────  RealtimeModule ──┘
 * ```
 *
 * It has no controller. Everything it does happens over `/social`, and the
 * REST surface that belongs beside it lives in the packages that own the data
 * — parks list their own, chat serves its own history.
 */
@Module({
  imports: [ParksModule, ChatModule, FriendsModule, SocialBusModule],
  providers: [SocialGateway],
  exports: [SocialGateway],
})
export class RealtimeModule {}
