# User-exported Skill + Chain MCP Flow proof — 03 November 2026

This is the original JSON exported from the public website by the project owner, accompanied by a deterministic re-evaluation test. The original submitted file was `pharos-skill-chain-mcp-1793690702116.json`.

- [Read the full user-exported five-step JSON](./user-export-2026-11-03.json)
- [Open the web app](https://skill-chain-mcp-flow.trantanlong2411.workers.dev/)
- [Source of the custom Skill](../src/skill.mjs)
- [Official Chain MCP session implementation](../src/mcp.mjs)
- [User export verifier](../scripts/verify-user-export.mjs)
- [Earlier successful independent CI test of both ALLOW and HOLD](https://github.com/trantanlong2411-droid/Skill-Chain-MCP-Flow/actions/runs/41595321180)

## Actual contents of the exported result

- Observed at `2026-11-03T07:24:08.549Z`.
- Pharos **Mainnet** chain ID `1672`, latest block `21994114`.
- The exported MCP trace shows successful `initialize`, `get_chain_info`, `get_gas_price`, and `get_balance` using Streamable HTTP to `https://mcp.pharos.xyz/mcp`.
- Network gas price: `10 Gwei` (`10000000000 wei`).
- Sample public address balance: `0 PROS`.
- The same `gasWei` and `balanceWei` fields are passed from Chain MCP into the Skill input within the **same five-step response**.
- Skill `pharos-gas-readiness-gate` chose **HOLD**: `GAS_PRICE_CEILING` failed and `COST_BUDGET` failed, while `WALLET_MINIMUM` passed.
- Skill input policy caps gas at `0 Gwei` and estimated cost at `0 PROS`, so the observed `10 Gwei` price and estimated `0.00021 PROS` cost cause the HOLD.
- `assumedGasUnits` is `21000`; this cost is hypothetical arithmetic, **not** an RPC `estimate_gas`.
- Output is `READ_ONLY_ANALYSIS`; `transactionBroadcast: false`.

## Why this demonstrates tool composition

The Skill's decision is directly dependent on the `get_gas_price` and `get_balance` outputs from Chain MCP. An earlier MCP block number is used in the balance query. It is not two unrelated tool results on the same dashboard: the exported trace explicitly shows both the produced fields and the Skill's consumed input fields.

The separate test `node scripts/verify-user-export.mjs` reads the JSON, checks the five-step ordering and the exact data linkage, and independently calls the same Skill logic with the exported MCP values. It must reproduce the entire decision object, including all rule evaluations.

The original export is an app-generated record, not a cryptographically signed attestation of the MCP transport. The previously successful GitHub Actions live integration test separately exercised the deployed Worker against hosted Chain MCP and retained the machine-readable trace artifact `pharos-skill-chain-mcp-live-proof`.

## Reviewer demonstration

Open the website and run **Demo: relaxed limits**, then **Demo: strict limits**. Expand the full trace and observe three Chain MCP tool calls feeding the Skill. Export the resulting JSON from the page. You can submit the website as Proof Link, the repository as Repo Link, and link this document in reviewer notes.

This read-only monitoring Skill makes no transfers or on-chain transactions. It is a custom `SKILL.md` implemented by JavaScript in the Worker; it is not a claim that an externally hosted SkillEngine service executed it.
