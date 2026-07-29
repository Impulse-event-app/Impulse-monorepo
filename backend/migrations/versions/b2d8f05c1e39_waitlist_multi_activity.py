"""waitlist: multi-select activities + free-text "Something else"

"What would you book first?" (one choice) became "What activities do you love
doing?" (many), so preferred_activity text → preferred_activities text[]. Adds
Go-karting to the allowed set, and other_activity to hold what someone types
when they pick "Something else".

Free text is kept in its own column rather than mixed into the array: the array
stays a closed set the API validates against, and the long tail of typed
answers stays separately queryable — it's the more interesting half for a pitch
("what are people asking for that we don't list yet").

Written as add → backfill → drop so it's non-destructive on a populated table,
even though waitlist is currently empty.

Revision ID: b2d8f05c1e39
Revises: a1c7e94b3d20
Create Date: 2026-07-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b2d8f05c1e39'
down_revision: Union[str, Sequence[str], None] = 'a1c7e94b3d20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('waitlist', sa.Column(
        'preferred_activities', postgresql.ARRAY(sa.Text()),
        nullable=False, server_default='{}',
    ))
    op.add_column('waitlist', sa.Column('other_activity', sa.Text(), nullable=True))

    # Each existing single choice becomes a one-element array.
    op.execute("UPDATE waitlist SET preferred_activities = ARRAY[preferred_activity]")

    op.drop_column('waitlist', 'preferred_activity')


def downgrade() -> None:
    op.add_column('waitlist', sa.Column('preferred_activity', sa.Text(), nullable=True))
    # Collapses back to the first choice — a lossy reverse, by nature.
    op.execute("UPDATE waitlist SET preferred_activity = preferred_activities[1]")
    op.execute("UPDATE waitlist SET preferred_activity = 'Something else' WHERE preferred_activity IS NULL")
    op.alter_column('waitlist', 'preferred_activity', nullable=False)

    op.drop_column('waitlist', 'other_activity')
    op.drop_column('waitlist', 'preferred_activities')
