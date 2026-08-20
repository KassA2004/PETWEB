import { SetMetadata } from '@nestjs/common';

/**
 * Opts a route out of the global AuthGuard.
 * Per 00-conventions.md §2: "Routes are opted out with @Public()."
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
