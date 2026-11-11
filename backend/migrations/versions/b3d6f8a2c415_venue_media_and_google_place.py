"""venue photo gallery, Google place data, deal videos and auto titles

- venues.image_urls: the photo gallery, cover first. image_url stays as the
  cover so builds that only know one photo keep working.
- venues.google_place_id / popular_times / popular_times_fetched_at: the
  Google Maps place the venue linked in the portal, and its hourly
  busyness, which starts the deal composer's bars before any bookings exist.
- deals.reel_id / deal_schedules.reel_id: the Discover video advertising
  the deal (optional).
- deals.auto_title / deal_schedules.auto_title: the venue left the name blank,
  so the title is "<venue> · <price>" and follows price changes.
- venue-reels storage policies: venues upload their own videos under their
  uid/ prefix, the same rule as venue-photos.

Revision ID: b3d6f8a2c415
Revises: b3f6a2d8e914
Create Date: 2026-11-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'b3d6f8a2c415'
down_revision: Union[str, Sequence[str], None] = 'b3f6a2d8e914'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _storage_exists() -> bool:
    # Plain Postgres (tests, the local screenshot stack) has no storage schema.
    return bool(op.get_bind().execute(sa.text(
        "select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects'"
    )).scalar())


def upgrade() -> None:
    op.add_column('venues', sa.Column('image_urls', postgresql.ARRAY(sa.Text()), server_default='{}', nullable=False))
    # Live already had this column (empty, from a hand-applied schema change).
    op.execute("alter table venues add column if not exists google_place_id text")
    op.add_column('venues', sa.Column('popular_times', postgresql.JSONB(), nullable=True))
    op.add_column('venues', sa.Column('popular_times_fetched_at', sa.DateTime(timezone=True), nullable=True))
    op.execute("update venues set image_urls = array[image_url] where image_url is not null and image_url <> ''")

    for table in ('deals', 'deal_schedules'):
        op.add_column(table, sa.Column(
            'reel_id', postgresql.UUID(as_uuid=False),
            sa.ForeignKey('venue_reels.id', ondelete='SET NULL'), nullable=True,
        ))
        op.add_column(table, sa.Column('auto_title', sa.Boolean(), server_default='false', nullable=False))

    if _storage_exists():
        op.execute("""
            insert into storage.buckets (id, name, public)
            values ('venue-reels', 'venue-reels', true)
            on conflict (id) do nothing;

            drop policy if exists "venue-reels: public read" on storage.objects;
            create policy "venue-reels: public read" on storage.objects for select
              using (bucket_id = 'venue-reels');

            drop policy if exists "venue-reels: owner insert" on storage.objects;
            create policy "venue-reels: owner insert" on storage.objects for insert to authenticated
              with check (bucket_id = 'venue-reels' and (storage.foldername(name))[1] = auth.uid()::text);

            drop policy if exists "venue-reels: owner modify" on storage.objects;
            create policy "venue-reels: owner modify" on storage.objects for update to authenticated
              using (bucket_id = 'venue-reels' and (storage.foldername(name))[1] = auth.uid()::text);

            drop policy if exists "venue-reels: owner delete" on storage.objects;
            create policy "venue-reels: owner delete" on storage.objects for delete to authenticated
              using (bucket_id = 'venue-reels' and (storage.foldername(name))[1] = auth.uid()::text);
        """)


def downgrade() -> None:
    if _storage_exists():
        op.execute("""
            drop policy if exists "venue-reels: owner insert" on storage.objects;
            drop policy if exists "venue-reels: owner modify" on storage.objects;
            drop policy if exists "venue-reels: owner delete" on storage.objects;
        """)
    for table in ('deal_schedules', 'deals'):
        op.drop_column(table, 'auto_title')
        op.drop_column(table, 'reel_id')
    op.drop_column('venues', 'popular_times_fetched_at')
    op.drop_column('venues', 'popular_times')
    op.drop_column('venues', 'google_place_id')
    op.drop_column('venues', 'image_urls')
