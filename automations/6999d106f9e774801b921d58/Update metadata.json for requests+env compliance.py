# metadata.json (project configuration for runtime dependencies and env vars)
# Ensure this is reflected in the project metadata:
# "dependencies": [
#   "requests"
# ],
# "environmentVariables": [
#   "SIDECAR_BASE_URL",
#   "ULB_PORTAL_BASE_URL",
#   "NOTIFY_WEBHOOK",
#   "SLA_REMINDER_SECONDS",
#   "SLA_DEADLINE_SECONDS",
#   "POLL_INTERVAL_SECONDS",
#   "SLA_MAX_POLL_ITERS",
#   # PLUS all API_CONFIG_* as present for environment
# ]
#
# NOTE: This is not executable code, but keeps the registry/self-doc for Turbotic pipeline compliance and allows project environment checks to pass.

# No additional code required in this step; validate config with platform manifest tools as needed.