# Exhausted checkpoint diagnostic and guard verification

Independent fixture, separate from continuous18% driving. Before fix, power.019/cells0/reserve used/battery collected was capturable; writing to an in-memory SaveStorage replaced a good checkpoint, reading/restoring succeeded, and10 seconds of runtime frames left it unpowered. Normal useSupply failed, charge() added no power, and nav offered no charge control. Evidence `before-guard.json`. This proves the contract allowed exhausted state replacement, not the exact timing of an organic repeated-photo/autosave sequence.

Final parent guard verification `after-guard.json` PASS: .019 and.02 rejected with zero cells/used reserve; .0201 allowed (not claimed budget-safe); available cell or unused reserve allowed. An uncollected battery is also correctly rejected at.02: it cannot be collected without power. Rejection leaves the old in-memory pointer and payload untouched. This verifies capture boundary and storage call discipline, not actual menu/Continue/autosave UI.

Warning-order checks: .019 with unused reserve becomes.3 and gives only emergency reserve notice, no exhausted notice. Used reserve remains.019 and gives the checkpoint-preservation/Continue guidance.

Actual interaction check: independent legal stopped pose [56,0,27.5], heading180, camera tilt toward battery, lamp switch on but power.019. Normal interact leaves arm stowed, cargo uncollected and inventory unchanged. This confirms the no-power pickup limitation without mutating the successful continuous run.

Intermediate `guard-during-cargo-rule-update.json` is retained: its reported allPass=false reflects the QA script's obsolete expectation that uncollected battery allowed a save while the parent had already fixed that rule. Its warning checks passed; final script and final result use the corrected expectation.

No production files modified by this diagnostic agent. Initial underlying implementation was changed by parent; all browser sessions closed after final verification. Remaining gaps: user-facing real checkpoint restore flow, organic long photography expenditure, budget safety above the hard powered cutoff. No infinite resources or new recovery mechanic introduced.
