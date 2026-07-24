/**
 * Plain request-body interface for FindingsController. Follows the same
 * convention as reviews.types.ts — this codebase does not use
 * class-validator/class-transformer DTO classes; request shapes are typed
 * interfaces and validated manually in the service layer.
 */
export interface UpdateFindingRequestBody {
  approved: boolean;
}
