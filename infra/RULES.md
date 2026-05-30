# Firebase security rules

Buddy Live shares the `puck-buddy` Firebase project with Puck Buddy. **Never deploy the Buddy-only slice alone** — the live database has a catch-all deny that would block existing collections.

## Which file to use

| File | Role |
| --- | --- |
| `firestore.rules` | Buddy Live–only slice (reference / diff). **Not deployable standalone.** |
| `firestore.rules.merged` | **Deploy this** — Puck Buddy + Buddy Live combined Firestore rules |
| `storage.rules` | Buddy Live–only Storage slice (reference / diff) |
| `storage.rules.merged` | **Deploy this** — combined Storage rules |

## Deploy workflow

1. Read [docs/FIRESTORE_RULES.md](../docs/FIRESTORE_RULES.md) for merge safety.
2. Copy merged files into the `modelforpuckbuddy` Firebase project (or your deploy repo):

```bash
cp infra/firestore.rules.merged /path/to/modelforpuckbuddy/firebase/firestore.rules
cp infra/storage.rules.merged   /path/to/modelforpuckbuddy/firebase/storage.rules
firebase deploy --only firestore:rules,storage:rules --project puck-buddy
```

`infra/firebase.json` points the Firebase CLI at these rule paths when deploying from this repo.
