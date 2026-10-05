"""Safe, non-destructive utility for inspecting and assigning legacy unowned study sets.

Existing study sets created prior to authentication have `user_id = NULL`.
To prevent exposing legacy study sets to arbitrary new accounts, queries on the
study library filter strictly by the authenticated user's ID (`user_id == current_user.user_id`).

This CLI tool allows the administrator or project owner to inspect unowned records
and explicitly claim them for a designated user account without silent or automatic attribution.

Usage:
    # Check status of legacy study sets:
    python -m app.migrate_legacy --status

    # Claim all legacy sets for a specific user ID:
    python -m app.migrate_legacy --claim-all --user-id "<USER_UUID>"

    # Claim a specific study set by ID:
    python -m app.migrate_legacy --claim-set 1 --user-id "<USER_UUID>"
"""

import argparse
import sys
from sqlalchemy import select, update
from app.database import SessionLocal, init_db
from app.models import StudySet


def show_status():
    init_db()
    with SessionLocal() as db:
        unowned = list(db.scalars(select(StudySet).where(StudySet.user_id.is_(None)).order_by(StudySet.id)))
        owned = list(db.scalars(select(StudySet).where(StudySet.user_id.is_not(None)).order_by(StudySet.id)))

        print("=== ScribeFlow Study Set Ownership Status ===")
        print(f"Total study sets: {len(unowned) + len(owned)}")
        print(f"Unowned legacy study sets (user_id is NULL): {len(unowned)}")
        print(f"Account-associated study sets: {len(owned)}")
        print("---------------------------------------------")
        if unowned:
            print("Unowned Legacy Sets:")
            for s in unowned:
                print(f"  [ID {s.id}] \"{s.title}\" (topic: {s.topic}, created: {s.created_at})")
        else:
            print("No unowned legacy study sets found.")


def claim_sets(user_id: str, set_id: int | None = None):
    init_db()
    clean_uid = user_id.strip()
    if not clean_uid:
        print("Error: user-id cannot be empty.", file=sys.stderr)
        sys.exit(1)

    with SessionLocal() as db:
        if set_id is not None:
            target = db.scalar(select(StudySet).where(StudySet.id == set_id))
            if not target:
                print(f"Error: Study set with ID {set_id} not found.", file=sys.stderr)
                sys.exit(1)
            target.user_id = clean_uid
            db.commit()
            print(f"Successfully assigned Study Set [ID {set_id}] \"{target.title}\" to user '{clean_uid}'.")
        else:
            stmt = (
                update(StudySet)
                .where(StudySet.user_id.is_(None))
                .values(user_id=clean_uid)
            )
            result = db.execute(stmt)
            db.commit()
            print(f"Successfully assigned {result.rowcount} legacy study set(s) to user '{clean_uid}'.")


def main():
    parser = argparse.ArgumentParser(description="Manage ScribeFlow study set legacy ownership migration.")
    parser.add_argument("--status", action="store_true", help="Display ownership breakdown of all study sets")
    parser.add_argument("--claim-all", action="store_true", help="Assign all unowned legacy study sets to --user-id")
    parser.add_argument("--claim-set", type=int, default=None, help="Assign a specific study set ID to --user-id")
    parser.add_argument("--user-id", type=str, default="", help="User UUID / ID to assign sets to")

    args = parser.parse_args()

    if args.status or (not args.claim_all and args.claim_set is None):
        show_status()
        return

    if not args.user_id:
        print("Error: --user-id is required when claiming study sets.", file=sys.stderr)
        sys.exit(1)

    claim_sets(user_id=args.user_id, set_id=args.claim_set)


if __name__ == "__main__":
    main()
