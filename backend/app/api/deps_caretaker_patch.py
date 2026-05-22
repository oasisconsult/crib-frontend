# This file documents the two patches needed in deps.py and me.py.
# Apply via the shell script below.
#
# PATCH 1 — deps.py: add "caretaker" to FALLBACK_PRIORITY and inject the
#            role when the profile has caretaker_owner_profile_id set.
#
# PATCH 2 — me.py: expose caretaker_meta and property_ids in ProfileOut.
