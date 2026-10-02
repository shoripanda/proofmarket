/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/proofmarket.json`.
 */
export type Proofmarket = {
  address: "A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s";
  metadata: {
    name: "proofmarket";
    version: "0.1.0";
    spec: "0.1.0";
    description: "ProofMarket escrow + attestation program (specs/proofmarket/implementation/ja/06-solana-program-design.md)";
  };
  instructions: [
    {
      name: "finalizeVerification";
      docs: [
        "verifier: write outcome, evidence_root, result_hash, recipients. Funded -> Finalized. No time limit (D-11).",
      ];
      discriminator: [17, 156, 245, 109, 209, 118, 72, 240];
      accounts: [
        {
          name: "verifier";
          signer: true;
        },
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "task";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [116, 97, 115, 107];
              },
              {
                kind: "account";
                path: "task.taskIdHash";
                account: "task";
              },
            ];
          };
        },
      ];
      args: [
        {
          name: "args";
          type: {
            defined: {
              name: "finalizeVerificationArgs";
            };
          };
        },
      ];
    },
    {
      name: "initializeConfig";
      docs: ["admin: create Config (06 §3.1)."];
      discriminator: [208, 127, 21, 1, 194, 190, 196, 70];
      accounts: [
        {
          name: "admin";
          writable: true;
          signer: true;
        },
        {
          name: "config";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "bountyMint";
        },
        {
          name: "treasury";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "args";
          type: {
            defined: {
              name: "initializeConfigArgs";
            };
          };
        },
      ];
    },
    {
      name: "initializeTask";
      docs: [
        "operator: create Task + vault, move amount_per_witness * N from treasury into the vault. -> Funded",
      ];
      discriminator: [96, 206, 3, 20, 245, 167, 60, 125];
      accounts: [
        {
          name: "operator";
          writable: true;
          signer: true;
        },
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "task";
          docs: [
            "`init` fails if the PDA exists: the same task can never be funded twice (P-INIT-02, I-IDEM-03).",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [116, 97, 115, 107];
              },
              {
                kind: "arg";
                path: "args.taskIdHash";
              },
            ];
          };
        },
        {
          name: "mint";
        },
        {
          name: "vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
              {
                kind: "account";
                path: "task";
              },
            ];
          };
        },
        {
          name: "treasury";
          writable: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "args";
          type: {
            defined: {
              name: "initializeTaskArgs";
            };
          };
        },
      ];
    },
    {
      name: "refund";
      docs: ["operator: return everything to treasury, close vault. Funded -> Refunded."];
      discriminator: [2, 96, 183, 251, 63, 208, 46, 46];
      accounts: [
        {
          name: "operator";
          writable: true;
          signer: true;
        },
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "task";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [116, 97, 115, 107];
              },
              {
                kind: "account";
                path: "task.taskIdHash";
                account: "task";
              },
            ];
          };
        },
        {
          name: "vault";
          docs: [
            "Read only after the status check, so a refund after the vault was closed fails with InvalidStatus (D9).",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
              {
                kind: "account";
                path: "task";
              },
            ];
          };
        },
        {
          name: "treasury";
          writable: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [
        {
          name: "reason";
          type: {
            defined: {
              name: "refundReason";
            };
          };
        },
      ];
    },
    {
      name: "settle";
      docs: [
        "operator: pay each recipient amount_per_witness, return remainder, close vault. Finalized -> Settled.",
        "remaining_accounts = recipients' ATAs in the order of task.recipients.",
      ];
      discriminator: [175, 42, 185, 87, 144, 131, 102, 212];
      accounts: [
        {
          name: "operator";
          docs: ["Also receives the vault's rent when it is closed."];
          writable: true;
          signer: true;
        },
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "task";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [116, 97, 115, 107];
              },
              {
                kind: "account";
                path: "task.taskIdHash";
                account: "task";
              },
            ];
          };
        },
        {
          name: "mint";
        },
        {
          name: "vault";
          docs: [
            "Read only after the status check, so a settle after the vault was closed fails with InvalidStatus (D8, D10).",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
              {
                kind: "account";
                path: "task";
              },
            ];
          };
        },
        {
          name: "treasury";
          writable: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [];
    },
    {
      name: "updateConfig";
      docs: [
        "admin: rotate operator / verifier, pause, change max_witnesses (<= MAX_RECIPIENTS) or bounty mint.",
      ];
      discriminator: [29, 158, 252, 191, 10, 83, 219, 99];
      accounts: [
        {
          name: "admin";
          signer: true;
          relations: ["config"];
        },
        {
          name: "config";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
      ];
      args: [
        {
          name: "args";
          type: {
            defined: {
              name: "updateConfigArgs";
            };
          };
        },
      ];
    },
  ];
  accounts: [
    {
      name: "config";
      discriminator: [155, 12, 170, 224, 30, 250, 204, 130];
    },
    {
      name: "task";
      discriminator: [79, 34, 229, 55, 88, 90, 55, 84];
    },
  ];
  events: [
    {
      name: "taskInitialized";
      discriminator: [250, 247, 188, 82, 39, 147, 253, 145];
    },
    {
      name: "taskRefunded";
      discriminator: [49, 230, 123, 76, 62, 16, 104, 128];
    },
    {
      name: "taskSettled";
      discriminator: [161, 220, 91, 215, 23, 253, 247, 65];
    },
    {
      name: "verificationFinalized";
      discriminator: [86, 204, 238, 243, 86, 75, 243, 13];
    },
  ];
  errors: [
    {
      code: 6000;
      name: "paused";
      msg: "Program is paused";
    },
    {
      code: 6001;
      name: "unauthorized";
      msg: "Signer is not authorized for this instruction";
    },
    {
      code: 6002;
      name: "invalidMint";
      msg: "Mint is not the configured bounty mint";
    },
    {
      code: 6003;
      name: "invalidTreasury";
      msg: "Treasury account does not match config";
    },
    {
      code: 6004;
      name: "invalidAmount";
      msg: "Amount must be greater than zero";
    },
    {
      code: 6005;
      name: "invalidWitnessConfig";
      msg: "Require 1 <= quorum <= required_witnesses <= max_witnesses";
    },
    {
      code: 6006;
      name: "deadlineInPast";
      msg: "Deadline must be in the future";
    },
    {
      code: 6007;
      name: "amountOverflow";
      msg: "Arithmetic overflow";
    },
    {
      code: 6008;
      name: "invalidStatus";
      msg: "Instruction not allowed in the current task status";
    },
    {
      code: 6009;
      name: "invalidRoot";
      msg: "evidence_root and result_hash must be non-zero";
    },
    {
      code: 6010;
      name: "invalidRecipients";
      msg: "Recipients are duplicated, default, too many or too few for the outcome";
    },
    {
      code: 6011;
      name: "recipientCountMismatch";
      msg: "remaining_accounts length differs from recipient_count";
    },
    {
      code: 6012;
      name: "recipientAccountMismatch";
      msg: "Recipient token account is not the expected ATA / mint / owner";
    },
    {
      code: 6013;
      name: "insufficientVaultBalance";
      msg: "Vault balance is insufficient for the payout";
    },
    {
      code: 6014;
      name: "notExpired";
      msg: "Task deadline has not passed";
    },
  ];
  types: [
    {
      name: "config";
      docs: ["seeds = [CONFIG_SEED]"];
      type: {
        kind: "struct";
        fields: [
          {
            name: "admin";
            type: "pubkey";
          },
          {
            name: "operator";
            type: "pubkey";
          },
          {
            name: "verifier";
            type: "pubkey";
          },
          {
            name: "bountyMint";
            docs: ["Circle Devnet USDC or an own test mint (06 §6)."];
            type: "pubkey";
          },
          {
            name: "treasury";
            docs: ["operator-owned ATA of bounty_mint."];
            type: "pubkey";
          },
          {
            name: "maxWitnesses";
            docs: ["<= MAX_RECIPIENTS."];
            type: "u8";
          },
          {
            name: "paused";
            docs: [
              "true: initialize_task is rejected. finalize/settle/refund keep working so workers still get paid.",
            ];
            type: "bool";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "finalizeVerificationArgs";
      type: {
        kind: "struct";
        fields: [
          {
            name: "outcome";
            type: {
              defined: {
                name: "outcome";
              };
            };
          },
          {
            name: "evidenceRoot";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "resultHash";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "recipients";
            type: {
              vec: "pubkey";
            };
          },
        ];
      };
    },
    {
      name: "initializeConfigArgs";
      type: {
        kind: "struct";
        fields: [
          {
            name: "operator";
            type: "pubkey";
          },
          {
            name: "verifier";
            type: "pubkey";
          },
          {
            name: "maxWitnesses";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "initializeTaskArgs";
      type: {
        kind: "struct";
        fields: [
          {
            name: "taskIdHash";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "requesterRefHash";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "amountPerWitness";
            type: "u64";
          },
          {
            name: "requiredWitnesses";
            type: "u8";
          },
          {
            name: "quorum";
            type: "u8";
          },
          {
            name: "deadline";
            type: "i64";
          },
        ];
      };
    },
    {
      name: "outcome";
      type: {
        kind: "enum";
        variants: [
          {
            name: "none";
          },
          {
            name: "verified";
          },
          {
            name: "noConsensus";
          },
          {
            name: "insufficientWitnesses";
          },
        ];
      };
    },
    {
      name: "refundReason";
      type: {
        kind: "enum";
        variants: [
          {
            name: "none";
          },
          {
            name: "cancelled";
          },
          {
            name: "expired";
          },
        ];
      };
    },
    {
      name: "task";
      docs: [
        "seeds = [TASK_SEED, task_id_hash]. Kept forever as the public receipt; only the vault is closed.",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "version";
            type: "u8";
          },
          {
            name: "bump";
            type: "u8";
          },
          {
            name: "vaultBump";
            type: "u8";
          },
          {
            name: "taskIdHash";
            docs: ['SHA-256("proofmarket:task:v1:" + verification_id)'];
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "requester";
            docs: [
              "Funding source. MVP: treasury owner (operator) as custodian of the requester's prepaid balance (D-05).",
            ];
            type: "pubkey";
          },
          {
            name: "requesterRefHash";
            docs: ["SHA-256(credential_id), for per-requester aggregation without identity."];
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "mint";
            type: "pubkey";
          },
          {
            name: "amountPerWitness";
            docs: ["Base units (USDC: 10^-6)."];
            type: "u64";
          },
          {
            name: "requiredWitnesses";
            type: "u8";
          },
          {
            name: "quorum";
            type: "u8";
          },
          {
            name: "deadline";
            docs: ["Unix seconds. Used only for refund(Expired); finalize has no time limit (D-11)."];
            type: "i64";
          },
          {
            name: "status";
            type: {
              defined: {
                name: "taskStatus";
              };
            };
          },
          {
            name: "outcome";
            type: {
              defined: {
                name: "outcome";
              };
            };
          },
          {
            name: "refundReason";
            type: {
              defined: {
                name: "refundReason";
              };
            };
          },
          {
            name: "evidenceRoot";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "resultHash";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "recipientCount";
            type: "u8";
          },
          {
            name: "recipients";
            type: {
              array: ["pubkey", 5];
            };
          },
          {
            name: "paidTotal";
            type: "u64";
          },
          {
            name: "createdAt";
            type: "i64";
          },
          {
            name: "finalizedAt";
            type: "i64";
          },
          {
            name: "closedAt";
            type: "i64";
          },
        ];
      };
    },
    {
      name: "taskInitialized";
      type: {
        kind: "struct";
        fields: [
          {
            name: "task";
            type: "pubkey";
          },
          {
            name: "taskIdHash";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "amountTotal";
            type: "u64";
          },
          {
            name: "deadline";
            type: "i64";
          },
        ];
      };
    },
    {
      name: "taskRefunded";
      type: {
        kind: "struct";
        fields: [
          {
            name: "task";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "reason";
            type: {
              defined: {
                name: "refundReason";
              };
            };
          },
        ];
      };
    },
    {
      name: "taskSettled";
      type: {
        kind: "struct";
        fields: [
          {
            name: "task";
            type: "pubkey";
          },
          {
            name: "paidTotal";
            type: "u64";
          },
          {
            name: "remainder";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "taskStatus";
      docs: ["Off-chain mapping: 03-state-machine.md §4.3."];
      type: {
        kind: "enum";
        variants: [
          {
            name: "funded";
          },
          {
            name: "finalized";
          },
          {
            name: "settled";
          },
          {
            name: "refunded";
          },
        ];
      };
    },
    {
      name: "updateConfigArgs";
      docs: [
        "None = unchanged. bounty_mint and treasury must be changed together (06 §6 own-mint fallback).",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "operator";
            type: {
              option: "pubkey";
            };
          },
          {
            name: "verifier";
            type: {
              option: "pubkey";
            };
          },
          {
            name: "paused";
            type: {
              option: "bool";
            };
          },
          {
            name: "maxWitnesses";
            type: {
              option: "u8";
            };
          },
          {
            name: "bountyMint";
            type: {
              option: "pubkey";
            };
          },
          {
            name: "treasury";
            type: {
              option: "pubkey";
            };
          },
        ];
      };
    },
    {
      name: "verificationFinalized";
      type: {
        kind: "struct";
        fields: [
          {
            name: "task";
            type: "pubkey";
          },
          {
            name: "outcome";
            type: {
              defined: {
                name: "outcome";
              };
            };
          },
          {
            name: "evidenceRoot";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "resultHash";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "recipientCount";
            type: "u8";
          },
        ];
      };
    },
  ];
  constants: [
    {
      name: "configSeed";
      type: "bytes";
      value: "[99, 111, 110, 102, 105, 103]";
    },
    {
      name: "taskSeed";
      type: "bytes";
      value: "[116, 97, 115, 107]";
    },
    {
      name: "vaultSeed";
      type: "bytes";
      value: "[118, 97, 117, 108, 116]";
    },
  ];
};
