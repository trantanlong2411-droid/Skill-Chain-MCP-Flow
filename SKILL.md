---
name: pharos-gas-readiness-gate
description: One end-to-end skill that consumes live Pharos Mainnet Chain MCP get_chain_info, get_gas_price and get_balance tool results to make an allow-or-hold gas policy decision, with a complete trace. Not a transaction execution skill.
version: 1.0.0
---

# Pharos gas-readiness gate — Chain MCP composition

This is a custom Pharos SkillEngine-style skill documented with a `SKILL.md`, backed by executable deterministic logic in `src/skill.mjs`. The Skill is invoked by the agent flow implemented in `src/worker.mjs`. It does not claim that an external hosted SkillEngine service executed the JavaScript: the Worker hosts the custom skill implementation.

For any user request to assess Pharos network readiness:

1. Validate the public EVM address and configurable policy `maxGasGwei`, `maxEstimatedCostPros`, `minimumWalletPros` and `assumedGasUnits`.
2. Connect by **MCP Streamable HTTP**, not by bypassing MCP with `fetch(rpc)`, to the official hosted Chain MCP at `https://mcp.pharos.xyz/mcp`.
3. Initialize a real MCP session; call `get_chain_info`. Require **Pharos Mainnet chain ID 1672**, not Atlantic Testnet 688689.
4. Within the same MCP session call `get_gas_price` and `get_balance`; pin the balance query to the latest block returned by `get_chain_info`.
5. Feed the tool results into `evaluateSkill()`. The Skill uses the actual returned numeric fields and three policy rules to output `ALLOW` or `HOLD`, with reasons. Do not evaluate the Skill before Chain MCP has returned and been validated.
6. Show the trace: user policy → Chain MCP initialization → the three named MCP tool results → Skill input and decision. Export the JSON for audit.
7. If the hosted MCP call fails, report `ERROR_NO_DECISION` with no fake balances or quotes. Never broadcast, sign, transfer tokens or request private keys.

The estimated transaction cost equals **current reported gas price × assumed gas units** and is a theoretical comparison, not the output of `estimate_gas`. It is **not a transaction authorization**; ALLOW means only the monitoring policy is satisfied. A real transaction can still fail and would require an independent wallet confirmation and fresh preflight.

The hosted Chain MCP is read-only and uses the native PROS token. Keep the network and symbol distinct from earlier Pharos Atlantic projects.
