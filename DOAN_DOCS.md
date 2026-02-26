# DOAN — Decentralized Oracle Attestation Network

> **BOXMEOUT STELLA** uses DOAN (Decentralized Oracle Attestation Network) to provide tamper-proof, consensus-based outcome verification for wrestling prediction markets on Stellar.

---

## Table of Contents

1. [What is DOAN?](#what-is-doan)
2. [Architecture Overview](#architecture-overview)
3. [Oracle Lifecycle](#oracle-lifecycle)
4. [Attestation Flow](#attestation-flow)
5. [Staking & Slashing](#staking--slashing)
6. [Integration Points](#integration-points)
7. [API Reference](#api-reference)
8. [Smart Contract Interface](#smart-contract-interface)
9. [Security Considerations](#security-considerations)

---

## What is DOAN?

DOAN is a decentralized network of registered oracle validators that collectively verify and attest on-chain outcomes (e.g., match winners in wrestling events). Rather than trusting a single data source, multiple independent oracles each submit their result and a consensus mechanism prevents any single actor from manipulating outcomes.

**Key properties:**
- **Decentralized:** ≥3 oracles must reach consensus before a market is resolved.
- **Staked:** Every oracle must post XLM collateral, which can be slashed for malicious submissions.
- **Transparent:** All attestations are recorded on Stellar as Soroban contract invocations.
- **Final:** Once consensus threshold is met, market settlement triggers automatically.

---

## Architecture Overview

```
                ┌────────────────────────────────┐
                │        BOXMEOUT STELLA          │
                │     Prediction Market DApp       │
                └──────────────┬─────────────────┘
                               │  resolveMarket()
                               ▼
             ┌─────────────────────────────────────┐
             │         DOAN Oracle Contract         │
             │    (Soroban / Stellar Testnet/Main)  │
             │                                     │
             │  - registerOracle()                 │
             │  - submitAttestation()              │
             │  - getConsensusResult()             │
             │  - slashOracle()                    │
             └───────┬───────────┬────────────────┘
                     │           │
          ┌──────────▼──┐   ┌───▼──────────┐
          │   Oracle A   │   │   Oracle B    │  ...
          │  (validator) │   │  (validator)  │
          └─────────────┘   └──────────────┘
```

- **DOAN Contract:** Soroban smart contract at `contracts/boxmeout/` that manages oracle registration, attestation submission, and consensus resolution.
- **Backend Oracle Service:** `backend/src/services/blockchain/oracle.ts` — server-side wrapper around DOAN contract calls.
- **Oracle Controller:** `backend/src/controllers/oracle.controller.ts` — REST layer for oracle admin operations.
- **Oracle Routes:** `backend/src/routes/oracle.ts` — mounted at `/api/markets`.

---

## Oracle Lifecycle

```
Register ──► Stake ──► Active ──► Submit Attestation ──► Earn Reward
                                        │
                              Malicious/Wrong ──► Slash + Deactivate
```

1. **Registration:** Oracle validator sends `registerOracle(publicKey, stakeAmount)` to DOAN contract.
2. **Staking:** Minimum XLM stake is locked in the contract escrow.
3. **Active State:** Oracle is eligible to receive market assignment.
4. **Attestation:** After a market closes, oracle submits `submitAttestation(marketId, outcome, evidence)`.
5. **Consensus:** Once `⌈n/2⌉ + 1` oracles agree, `getConsensusResult()` returns the verified outcome.
6. **Settlement:** Market transitions to `RESOLVED` and winnings distribution is triggered.
7. **Reward:** Oracle receives a configurable fee in USDC/XLM per resolved market.

---

## Attestation Flow

```
Market CLOSED
      │
      ├── Backend broadcasts market_closed event to registered oracles
      │
      ▼
Oracle fetches match result from trusted data source
      │
      ▼
Oracle calls submitAttestation(marketId, outcome: 0|1, txHash)
      │
      ▼
DOAN Contract stores attestation (unique per oracle per market)
      │
      ▼
Check: attestationCount >= consensusThreshold?
      │
   YES ──► Emit MarketResolved event
   NO  ──► Wait for more attestations
      │
      ▼
Backend cron / event listener calls settleMarket(marketId)
```

### Attestation Data Model (Prisma)

```typescript
model Attestation {
  id        String   // UUID
  marketId  String   // FK → Market
  oracleId  String   // Oracle public key
  outcome   Int      // 0 = NO/Outcome B, 1 = YES/Outcome A
  txHash    String   // Stellar transaction hash
  createdAt DateTime
}
```

### Consensus Rules

| Registered Oracles | Required Consensus |
|---|---|
| 3 | 2 of 3 |
| 5 | 3 of 5 |
| 7 | 4 of 7 |

Formula: `Math.ceil(total / 2) + 1`

---

## Staking & Slashing

### Staking

- **Minimum Stake:** 10 XLM per oracle
- **Stake Lock Period:** Active while oracle has pending markets
- **Reward Rate:** 0.1–0.5% of resolved market volume (configurable)

### Slashing Conditions

| Condition | Penalty |
|---|---|
| Submit wrong outcome (minority) | 50% stake slash |
| No attestation within timeout | 10% stake slash |
| Double-submit conflicting outcomes | 100% slash + ban |

All slashed funds are redistributed to the treasury.

---

## Integration Points

### Backend Oracle Service

**File:** [`backend/src/services/blockchain/oracle.ts`](backend/src/services/blockchain/oracle.ts)

```typescript
// Fetch oracle status from Soroban contract
oracleService.getOracleStatus(oracleId: string): Promise<OracleStatus>

// Read attestations for a given market
oracleService.getMarketAttestations(marketId: string): Promise<Attestation[]>

// Check if consensus reached and trigger settlement
oracleService.checkAndSettle(marketId: string): Promise<boolean>
```

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/markets/:marketId/oracle/status` | Get oracle status for a market |
| `POST` | `/api/markets/:marketId/oracle/attest` | Submit oracle attestation (oracle auth required) |
| `GET` | `/api/markets/:marketId/oracle/attestations` | List all attestations |

### WebSocket Events

| Event | Room | Payload |
|---|---|---|
| `market_resolved` | `market:{marketId}` | `{ marketId, outcome, txHash, resolvedAt }` |
| `oracle_attested` | `market:{marketId}` | `{ oracleId, outcome, attestationCount }` |

---

## API Reference

### `GET /api/markets/:marketId/oracle/status`

Returns oracle consensus progress for a market.

**Response:**
```json
{
  "success": true,
  "data": {
    "marketId": "uuid",
    "status": "pending_consensus",
    "attestationCount": 2,
    "consensusThreshold": 3,
    "attestations": [
      { "oracleId": "G...", "outcome": 1, "txHash": "abc...", "createdAt": "..." }
    ]
  }
}
```

### `POST /api/markets/:marketId/oracle/attest`

Submit an outcome attestation (requires oracle authentication).

**Request Body:**
```json
{
  "outcome": 1,
  "evidence": "https://source.com/match-result",
  "signature": "base64-stellar-signature"
}
```

---

## Smart Contract Interface

**Location:** [`contracts/contracts/boxmeout/`](contracts/contracts/boxmeout/)

```rust
// Register oracle validator
fn register_oracle(env: Env, oracle: Address, stake: i128) -> Result<(), Error>;

// Submit attestation for a resolved market
fn submit_attestation(env: Env, market_id: BytesN<32>, outcome: u32) -> Result<(), Error>;

// Get consensus result (returns None if not yet reached)
fn get_consensus_result(env: Env, market_id: BytesN<32>) -> Option<u32>;

// Admin: slash misbehaving oracle
fn slash_oracle(env: Env, oracle: Address, reason: Symbol) -> Result<(), Error>;
```

---

## Security Considerations

1. **Sybil Resistance:** Economic stake requirement prevents cheap oracle proliferation.
2. **Time-Bounded Attestation:** Oracles must attest within `ATTESTATION_WINDOW` (default 48h after market close) or face slashing.
3. **Dispute Resolution:** Any market participant can open a `Dispute` within 24h of resolution. Disputed markets enter `DISPUTED` state requiring admin review.
4. **Oracle Key Isolation:** Oracle signing keys must differ from personal funds keys.
5. **Rate Limiting:** Oracle attestation endpoints are protected by the global `apiRateLimiter`.

---

## Related Documentation

- [Backend API Documentation](backend/API_DOCUMENTATION.md)
- [Smart Contracts README](contracts/README.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Swagger UI](http://localhost:3000/api-docs) (local dev)
