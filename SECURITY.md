# Security and boundary reporting

This framework treats a suspected cross-tenant leak, credential exposure, direct identifier, restricted personal material, unsupported claim bypass, or unauthorized execution path as a security issue.

Do not place the report, affected tenant data, credentials, screenshots containing customer information, or execution receipts in a public issue. Send the minimum sanitized description to the repository's configured security owner. If no owner has been configured yet, pause adoption of the affected version and record the issue in the private tenant risk register.

For each report, capture the framework version, affected generic artifact or control, a redacted reproduction path, impact boundary, containment step, and proposed regression test. The framework owner decides disclosure, remediation, and release timing. A tenant owner separately decides whether its own private workspace needs containment or notification.

This template includes no security contact by design. Set the accountable security owner before enabling protected branches or inviting contributors.
