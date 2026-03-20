# Playwright Project Structure Fix - TODO

## Plan Steps:
- [x] 1. Create config/env.js with demo credentials
- [x] 2. Move tests/LoginPage.js to tests/pages/LoginPage.js
- [x] 3. Update import in tests/login.spec.js
- [x] 4. Delete empty tests/tests/ directory
- [ ] 5. Verify with npx playwright test

## Progress:
All structure fixes complete. Update config/env.js with valid OpenCart demo credentials if tests fail on login, then re-run `npx playwright test`.
