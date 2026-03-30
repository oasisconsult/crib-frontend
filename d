[33mcommit 2a3a7cd3a62498262384829e695890a58de50481[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mmain[m[33m, [m[1;31morigin/main[m[33m)[m
Author: Oasis Consult Uganda <calebnk02@gmail.com>
Date:   Mon Mar 30 17:43:27 2026 +0100

    Remove .env.local

[33mcommit 987360b44a4e80a2b5ada2bb95d4e74072347833[m
Author: Oasis Consult Uganda <calebnk02@gmail.com>
Date:   Sun Mar 29 20:24:02 2026 +0100

    ports issues

[33mcommit 334f4e1d347cf04ea6140419822f556ff6404d11[m
Author: Oasis Consult Uganda <calebnk02@gmail.com>
Date:   Sun Mar 29 19:00:27 2026 +0100

    made changes

[33mcommit 0ff6f271758838d140e83f9ca458f7760f722674[m
Author: Oasis Consult Uganda <calebnk02@gmail.com>
Date:   Sun Mar 29 13:46:05 2026 +0100

    fix: resolve remaining 4 test failures and port conflicts
    
    Port conflicts:
    - docker-compose.local.yml: remap all host ports (+1 offset) so crib backend
      stack coexists with crib-frontend-* stack (5433/6380/8001/3010/3011/3012/9010/9011)
    - .env.local: update NEXT_PUBLIC_LOGTO_ENDPOINT, LOGTO_ADMIN_ENDPOINT, NEXT_PUBLIC_API_URL
      to match new ports; fix ENVIRONMENT=local → development; pad SECRET_KEY to 32+ chars
    
    Test failures:
    - conftest.py: pre-seed JWKS cache key in mock Redis so _fetch_jwks is never
      called during tests (fixes test_malformed_bearer ConnectError → 401)
    - security.py: catch httpx.HTTPError in decode_token to return 503 instead of
      unhandled ConnectError when Logto is unreachable
    - tenant_service.py verify_document: add db.refresh(doc, attribute_names=[...])
      after flush to fix AttributeError 'str' has no attribute 'value' on doc.type
    - factories.py / test_tenants.py: replace @test.local with @example.com —
      pydantic[email] rejects .local as a reserved/special-use domain (EmailStr)
    
    Result: 93/93 tests passing
    
    Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

[33mcommit d29206b1f7d43a472af4cff2e98a521401cc2094[m
Author: Oasis Consult Uganda <calebnk02@gmail.com>
Date:   Fri Mar 27 15:37:07 2026 +0000

    initial commit
