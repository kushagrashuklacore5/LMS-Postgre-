/**
 * The original Phase 2A suite (7 tests) was replaced by the remediation suite,
 * which covers the same scenarios (see test 15 there) against the hardened API:
 * idempotency keys, plan and stage are now mandatory and conflicts return 409.
 */
require('./test_phase2a_remediation');
