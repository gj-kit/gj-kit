import { SetMetadata } from '@nestjs/common';

/**
 * Reflector metadata key. A plain string rather than a symbol: `Reflector.get`
 * matches on value equality, so a dual-loaded copy of this package still
 * resolves the same key, and a string reads better in a stack trace.
 */
export const OPERATIONS_JOB_METADATA = '@gj-kit/nest-operations-jobs:job';

/**
 * Marks an `@Injectable()` provider as an operations job. The registry collects
 * it at bootstrap through `DiscoveryService`; no extra wiring per job.
 */
export function OperationsJobDefinition(): ClassDecorator {
  return SetMetadata(OPERATIONS_JOB_METADATA, true);
}
