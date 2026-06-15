Review the existing codebase and Workflow Engine Test Harness.

Execute the maintenance lifecycle workflow end-to-end.

Workflow:
1. Create contractor
2. Create maintenance job
3. Assign contractor
4. Upload completion photos
5. Complete job

Use the workflow engine rather than writing ad-hoc tests.

Analyze failures if any occur.

If the workflow fails:
- identify root cause
- propose fixes
- implement fixes where safe
- rerun the workflow

Provide:
- workflow execution summary
- failed steps
- API errors
- database errors
- recommended improvements