# Direct API training and retention review

Verified September 16, 2026. Google's review email prohibits generalized-model
training on Workspace data. ZDR is one way to satisfy that restriction, but
no-training and zero retention are different properties. This review covers API
services, not consumer Claude or ChatGPT subscriptions, and does not attest the
settings of any user's account.

| Service | Generalized training policy | Retention / ZDR |
| --- | --- | --- |
| OpenAI API | No training unless explicitly opted in. | Abuse logs normally up to 30 days; ZDR requires approval and has endpoint/model exceptions. `store: false` alone is not ZDR. |
| Anthropic API | Commercial inputs/outputs are not used for training by default; permission and feedback can change that. | Standard deletion within 30 days, with exceptions; separate ZDR arrangements, with covered-model exceptions. |
| xAI API | No training without explicit permission. | Default 30-day retention; team ZDR setting available, subject to account/environment eligibility. |
| Groq API | Agreement prohibits training/fine-tuning on inputs/outputs unless customer grants permission or instructs it. | Inference content ordinarily not retained, but reliability/abuse logs may last up to 30 days; ZDR opt-out controls available. |
| Gemini Developer API | Paid-service prompts/responses are not used to improve products. Unpaid services generally permit model improvement; EEA/UK/Switzerland exception documented. | Standard abuse monitoring retains prompts, context and outputs for 55 days. Paid service is not automatically ZDR. |
| OpenRouter | Enforced `provider.zdr: true` limits inference to ZDR endpoints; OpenRouter itself states it does not train on inputs/outputs. | Endpoint eligibility is maintained by OpenRouter. Plugins, account logging, and BYOK agreements require separate consideration. |

For a no-training-based direct API policy, OpenAI, Anthropic, xAI and Groq are
candidates under their published default API terms, with training opt-ins disabled.
Gemini needs verified paid-service status (or a substantiated applicable exception).
The API key alone does not establish account settings or paid-service status.
Do not label these direct integrations “ZDR enforced” on that basis.

September 17 implementation: direct OpenAI, Anthropic, xAI, Groq and Gemini API
connections are supported without a manual confirmation gate. No-training
terms/settings and a billing-enabled Gemini project remain documented requirements,
but the app does not inspect or technically enforce account-level eligibility.
This remains an explicit limitation for Google verification. Direct API routes
are not described as ZDR. OpenRouter's per-request ZDR enforcement is unchanged.

Sources:

- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
- [Anthropic commercial training policy](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)
- [Anthropic retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
- [Anthropic API retention arrangements](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)
- [xAI API security](https://docs.x.ai/developers/faq/security)
- [Groq services agreement, §4.2](https://console.groq.com/docs/legal/services-agreement)
- [Groq data controls](https://console.groq.com/docs/your-data)
- [Gemini terms](https://ai.google.dev/gemini-api/terms)
- [Gemini abuse monitoring](https://ai.google.dev/gemini-api/docs/usage-policies)
- [OpenRouter ZDR](https://openrouter.ai/docs/guides/features/zdr)
