# Guided Self-Check OpenAI analysis

OpenAI is an optional server-side adapter for internal AMBER decision support. Deterministic clinical rules remain the only source of the GREEN/AMBER/RED classification. The adapter cannot mutate classifications, questionnaire answers, or matched reason codes.

Configuration:

```text
GUIDED_SELF_CHECK_AI_PROVIDER=openai
OPENAI_API_KEY=<server-side secret>
GUIDED_SELF_CHECK_OPENAI_MODEL=<approved model identifier>
GUIDED_SELF_CHECK_OPENAI_TIMEOUT_MS=15000
GUIDED_SELF_CHECK_OPENAI_MAX_RETRIES=1
```

If the provider, key, or model is absent, no adapter is registered and processing retains the safe `PROVIDER_UNAVAILABLE` result. Keys must be stored in deployment secret management and must never be exposed to the web application.

The adapter uses the OpenAI Responses API with strict JSON Schema output, `store: false`, bounded timeout/retries, and the prompt version `amber-analysis-v1`. It sends questionnaire keys/text, normalized reported answers, questionnaire version, the immutable AMBER classification, and deterministic matched reason codes. It does not send names, emails, phone numbers, addresses, payments, bookings, authentication data, or database identifiers.

Automated tests use a mocked client and never call OpenAI. Do not enable a real provider in local or staging environments with real patient data unless the environment and data-processing configuration have been explicitly approved.
