"""Real PostgreSQL tests. Run only against a disposable, empty local database.
ALLOCATION_TEST_DATABASE_URL=postgresql://.../allocation_test python3 apps/api/__tests__/partner-allocations-postgres.py
Uses psql (PSQL can override its location), no Python dependencies.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlparse

url = os.environ['ALLOCATION_TEST_DATABASE_URL']
parsed = urlparse(url)
assert parsed.hostname in ('localhost', '127.0.0.1') and parsed.path == '/allocation_test', 'Use an empty, disposable local allocation_test database'
psql = os.environ.get('PSQL') or shutil.which('psql') or '/opt/homebrew/opt/libpq/bin/psql'
root = Path(__file__).resolve().parents[3]

def query(sql, success=True):
    result = subprocess.run([psql, url, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True)
    if success and result.returncode:
        raise AssertionError(result.stderr + '\nSQL: ' + sql[:300])
    if not success:
        assert result.returncode and ('ALLOCATION_CONFLICT' in result.stderr or 'VEHICLE_UNAVAILABLE' in result.stderr or 'Seasons must' in result.stderr or 'overlap' in result.stderr), result.stderr
    return result.stdout.strip()

query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
query((Path(__file__).parent / 'fixtures/allocation-schema.sql').read_text())
query((root / 'supabase/migrations/20260927000000_partner_allocations.sql').read_text())
query((root / 'supabase/migrations/20261023023957_owner_use_open_ended.sql').read_text())
query((root / 'supabase/migrations/20261023050000_booking_capacity_and_assignment_conflicts.sql').read_text())
partner = '00000000-0000-0000-0000-000000000001'
query(f"""
INSERT INTO stores VALUES ('test');
INSERT INTO accommodation_partners VALUES ('{partner}','test','bravo',NULL,true,'active');
INSERT INTO vehicle_models VALUES ('bike','Bike','scooter',true);
INSERT INTO fleet SELECT 'v'||n,'test','bike','Available' FROM generate_series(1,4) n;
SELECT allocation_configure('test','{partner}','tester','tiers','{{"vehicleType":"bike","tiers":[{{"name":"All year","qty":2,"startMonth":1,"endMonth":12}}]}}');
SELECT allocation_configure('test','{partner}','tester','preview','{{}}');
""")
assert query("SELECT coalesce((SELECT enabled FROM partner_allocation_settings WHERE store_id='test'),false)") == 'f'
query(f"SELECT allocation_configure('test','{partner}','tester','activate','{{}}')")

def hold(n, ref='NULL', start="now()+interval '3 days'", end="now()+interval '4 days'", expires="now()+interval '10 minutes'"):
    return f"INSERT INTO booking_holds(id,store_id,vehicle_model_id,pickup_datetime,dropoff_datetime,session_token,expires_at,partner_ref) VALUES ('00000000-0000-0000-0000-{n:012d}','test','bike',{start},{end},'session-{n}',{expires},{ref});"

def availability(ref='NULL'):
    return json.loads(query(f"SELECT allocation_availability('test',now()+interval '3 days',now()+interval '4 days',{ref})"))[0]

assert availability()['availableCount'] == 2
query(hold(1))
assert availability()['availableCount'] == 1
# Two simultaneous callers race for the last shared slot.
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    results = list(pool.map(lambda n: subprocess.run([psql,url,'-X','-q','-v','ON_ERROR_STOP=1'], input=hold(n), text=True, capture_output=True), [2,3]))
assert sum(r.returncode == 0 for r in results) == 1, [r.stderr for r in results]
assert availability()['availableCount'] == 0
assert availability("'bravo'")['availableCount'] == 2
query(hold(4,"'bravo'"))
query(hold(5,"'bravo'"))
query(hold(6,"'bravo'"), success=False)
# Protected cancellation does not open the shared pool.
query("DELETE FROM booking_holds WHERE session_token='session-4'")
assert availability()['availableCount'] == 0
assert availability("'bravo'")['availableCount'] == 1
# Conversion is one durable reservation, with its original pool.
row = json.loads(query("SELECT to_jsonb(h)||jsonb_build_object('booking_hold_id',id,'partner_ref','bravo','order_reference','TEST-CONFIRM') FROM booking_holds h WHERE session_token='session-5'"))
for key in ['id','session_token','expires_at','created_at']:
    row.pop(key, None)
query("SELECT id FROM allocation_insert_bookings('"+json.dumps([row])+"'::jsonb)")
first = query("SELECT id FROM orders_raw WHERE order_reference='TEST-CONFIRM'")
assert query("SELECT id FROM allocation_insert_bookings('"+json.dumps([row])+"'::jsonb)") == first
assert query("SELECT count(*) FROM capacity_reservations WHERE released_at IS NULL AND source_key LIKE 'raw:%'") == '1'
assert availability()['availableCount'] == 0
# Raw -> active conversion preserves one reservation and assigned pool.
query("BEGIN; INSERT INTO orders VALUES ('active','test','bravo','active','TEST-CONFIRM'); INSERT INTO order_items SELECT 'item','test','active','v1',pickup_datetime,dropoff_datetime,now() FROM orders_raw WHERE order_reference='TEST-CONFIRM'; UPDATE orders_raw SET status='processed' WHERE order_reference='TEST-CONFIRM'; COMMIT;")
assert query("SELECT count(*) FROM capacity_reservations WHERE released_at IS NULL AND source_key='item:item'") == '1'
# Conflict edit is atomic.
query("UPDATE order_items SET vehicle_id='missing' WHERE id='item'", success=False)
assert query("SELECT vehicle_id FROM order_items WHERE id='item'") == 'v1'
query(f"SELECT allocation_configure('test','{partner}','tester','override',jsonb_build_object('vehicleType','bike','startsOn',(now()+interval '3 days')::date,'endsBefore',(now()+interval '5 days')::date,'qty',0,'reason','test'))", success=False)
# Fleet loss remains writable and produces a visible shortfall.
query("UPDATE fleet SET status='Under Maintenance' WHERE id='v4'")
assert query("SELECT count(*) FROM partner_allocation_shortfalls") == '1'
query("UPDATE fleet SET status='Available' WHERE id='v4'")
# Remove future commitments for independent cross-boundary checks.
query("UPDATE orders SET status='cancelled' WHERE id='active'; DELETE FROM booking_holds; UPDATE orders_raw SET status='cancelled';")
query(f"SELECT allocation_configure('test','{partner}','tester','override',jsonb_build_object('vehicleType','bike','startsOn',(now()+interval '5 days')::date,'endsBefore',(now()+interval '7 days')::date,'qty',0,'reason','season test'))")
query(hold(10,"'bravo'", "((now() AT TIME ZONE 'Asia/Manila')::date+4)::timestamp AT TIME ZONE 'Asia/Manila'", "((now() AT TIME ZONE 'Asia/Manila')::date+6)::timestamp AT TIME ZONE 'Asia/Manila'"))
assert query("SELECT count(DISTINCT pool) FROM capacity_reservation_segments s JOIN capacity_reservations r ON r.id=s.reservation_id WHERE r.source_key='hold:00000000-0000-0000-0000-000000000010'") == '2'
# A returned active shared unit stays in shared capacity through the handover buffer.
query("INSERT INTO orders VALUES ('returning','test',NULL,'active','RETURN-1')")
query("INSERT INTO order_items VALUES ('return-item','test','returning','v2',now()-interval '1 hour',now()+interval '4 hours',now())")
assert query("SELECT pool FROM capacity_reservation_segments s JOIN capacity_reservations r ON r.id=s.reservation_id WHERE r.source_key='item:return-item' LIMIT 1") == 'shared'
query("UPDATE orders SET status='completed' WHERE id='returning'")
assert query("SELECT count(*) FROM capacity_reservations WHERE source_key='item:return-item' AND released_at>now()") == '1'
assert query("SELECT count(*) FROM capacity_reservation_segments s JOIN capacity_reservations r ON r.id=s.reservation_id WHERE r.source_key='item:return-item' AND s.pool='shared' AND s.ends_at<=now()+interval '31 minutes'") == '1'

# Year-wrapping seasonal schedule and separate shoulder months.
other = '00000000-0000-0000-0000-000000000002'
query(f"INSERT INTO stores VALUES ('season'); INSERT INTO accommodation_partners VALUES ('{other}','season','season-partner',NULL,true,'active'); INSERT INTO fleet SELECT 'season-v'||n,'season','bike','Available' FROM generate_series(1,3) n;")
season_tiers = {'vehicleType':'bike','tiers':[
    {'name':'Peak','qty':2,'startMonth':10,'endMonth':4},
    {'name':'May','qty':1,'startMonth':5,'endMonth':5},
    {'name':'Trough','qty':0,'startMonth':6,'endMonth':8},
    {'name':'Sep','qty':1,'startMonth':9,'endMonth':9},
]}
query(f"SELECT allocation_configure('season','{other}','tester','tiers','"+json.dumps(season_tiers)+"'::jsonb)")
query("SELECT allocation_generate('season','2027-09-01')")
assert query(f"SELECT string_agg(to_char(effective_month,'YYYY-MM')||':'||scheduled_qty,',' ORDER BY effective_month) FROM partner_allocations WHERE partner_id='{other}' AND effective_month IN ('2026-10-01','2027-04-01','2027-05-01','2027-08-01','2027-09-01')") == '2026-10:2,2027-04:2,2027-05:1,2027-08:0,2027-09:1'

# One batched operation either reserves every unit or no unit.
query(f"SELECT allocation_configure('season','{other}','tester','activate','{{}}')")
rows = [{'id':f'00000000-0000-0000-0000-{n:012d}', 'store_id':'season','vehicle_model_id':'bike','pickup_datetime':'2027-01-10T09:00:00+08:00','dropoff_datetime':'2027-01-11T09:00:00+08:00','session_token':'batch','expires_at':'2027-01-10T08:50:00+08:00','partner_ref':'season-partner'} for n in (100,101,102,103)]
# Use far-future expiry relative to fixture execution; actual booking is in a future January.
rows = [{**r,'expires_at':'2028-01-10T08:50:00+08:00'} for r in rows]
query("SELECT id FROM allocation_insert_holds('"+json.dumps(rows)+"'::jsonb)", success=False)
assert query("SELECT count(*) FROM booking_holds WHERE session_token='batch'") == '0'
# Staff's existing atomic activation stores partner attribution before capacity checks commit.
staff_item = [{'id':'staff-item','vehicle_id':'season-v1','pickup_datetime':'2027-02-10T09:00:00+08:00','dropoff_datetime':'2027-02-11T09:00:00+08:00'}]
args = {'p_order_id':'staff-order','p_store_id':'season','p_order_items':staff_item,'p_status':'active','p_booking_token':'STAFF-1'}
query("SELECT allocation_activate_order('"+json.dumps(args)+"'::jsonb,'season-partner')")
assert query("SELECT partner_ref FROM orders WHERE id='staff-order'") == 'season-partner'
assert query("SELECT pool FROM capacity_reservation_segments s JOIN capacity_reservations r ON r.id=s.reservation_id WHERE r.source_key='item:staff-item' LIMIT 1") == 'guaranteed'
# Existing commitments survive slug changes and partner deactivation.
query(f"UPDATE accommodation_partners SET slug='new-season-slug' WHERE id='{other}'")
query("UPDATE order_items SET dropoff_datetime=dropoff_datetime+interval '1 minute' WHERE id='staff-item'")
assert query("SELECT partner_id FROM capacity_reservations WHERE source_key='item:staff-item'") == other
query(f"UPDATE accommodation_partners SET active=false WHERE id='{other}'")
query("UPDATE order_items SET dropoff_datetime=dropoff_datetime+interval '1 minute' WHERE id='staff-item'")
assert 'allocation' not in json.loads(query("SELECT allocation_availability('season','2027-02-10T09:00:00+08:00','2027-02-11T09:00:00+08:00','new-season-slug')"))[0]

# Cancelling owner-use restores capacity; cancelled blocks do not linger.
query("INSERT INTO fleet_unavailability(store_id,vehicle_id,starts_at,ends_at) VALUES ('season','season-v2','2027-03-10T09:00:00+08:00','2027-03-11T09:00:00+08:00')")
assert json.loads(query("SELECT allocation_availability('season','2027-03-10T09:00:00+08:00','2027-03-11T09:00:00+08:00')"))[0]['availableCount'] == 0
query("UPDATE fleet_unavailability SET cancelled_at=now() WHERE vehicle_id='season-v2'")
assert json.loads(query("SELECT allocation_availability('season','2027-03-10T09:00:00+08:00','2027-03-11T09:00:00+08:00')"))[0]['availableCount'] == 1
# Open-ended owner use stays blocked until it is cancelled.
before = json.loads(query("SELECT allocation_availability('season','2027-04-10T09:00:00+08:00','2027-04-11T09:00:00+08:00')"))[0]['availableCount']
query("INSERT INTO fleet_unavailability(store_id,vehicle_id,starts_at,ends_at) VALUES ('season','season-v3','2027-04-01T09:00:00+08:00',NULL)")
assert json.loads(query("SELECT allocation_availability('season','2027-04-10T09:00:00+08:00','2027-04-11T09:00:00+08:00')"))[0]['availableCount'] == before - 1
query("UPDATE fleet_unavailability SET cancelled_at=now() WHERE vehicle_id='season-v3' AND ends_at IS NULL")
assert json.loads(query("SELECT allocation_availability('season','2027-04-10T09:00:00+08:00','2027-04-11T09:00:00+08:00')"))[0]['availableCount'] == before
# A newly added, unclassified model can be classified after activation.
query("INSERT INTO vehicle_models VALUES ('new-bike','New Bike',NULL,true); INSERT INTO fleet VALUES ('season-new','season','new-bike','Available')")
assert query("SELECT count(*) FROM partner_allocation_shortfalls WHERE store_id='season'") == '1'
query(f"SELECT allocation_configure('season','{other}','tester','classify','"+json.dumps({'modelId':'new-bike','modelType':'scooter'})+"'::jsonb)")
assert query("SELECT type FROM vehicle_models WHERE id='new-bike'") == 'scooter'
assert query("SELECT count(*) FROM partner_allocation_shortfalls WHERE store_id='season'") == '0'
print('PASS: existing allocation, activation, cancellation, owner-use and concurrency regressions')

# Sequential model commitments reuse capacity, including holds at checkout.
query("INSERT INTO stores VALUES ('capacity'); INSERT INTO fleet SELECT 'capacity-v'||n,'capacity','bike','Available' FROM generate_series(1,10) n; INSERT INTO partner_allocation_settings(store_id,enabled) VALUES ('capacity',true);")
early_start, early_end = '2027-05-01T09:00:00+08:00', '2027-05-02T09:00:00+08:00'
late_start, late_end = '2027-05-03T09:00:00+08:00', '2027-05-04T09:00:00+08:00'
window_start, window_end = '2027-05-01T09:00:00+08:00', '2027-05-05T09:00:00+08:00'
for start, end in [(early_start, early_end), (late_start, late_end)]:
    query(f"INSERT INTO orders_raw(store_id,vehicle_model_id,pickup_datetime,dropoff_datetime,booking_channel) SELECT 'capacity','bike','{start}','{end}','direct' FROM generate_series(1,5)")
def capacity():
    return json.loads(query(f"SELECT allocation_availability('capacity','{window_start}','{window_end}')"))[0]['availableCount']
assert capacity() == 5
query(f"INSERT INTO booking_holds(store_id,vehicle_model_id,pickup_datetime,dropoff_datetime,session_token,expires_at) VALUES ('capacity','bike','{window_start}','{window_end}','checkout',now()+interval '10 minutes')")
assert capacity() == 4
query("DELETE FROM booking_holds WHERE store_id='capacity'; UPDATE orders_raw SET status='cancelled' WHERE store_id='capacity'")
for start, end in [(early_start, early_end), (late_start, late_end)]:
    query(f"INSERT INTO booking_holds(store_id,vehicle_model_id,pickup_datetime,dropoff_datetime,session_token,expires_at) SELECT 'capacity','bike','{start}','{end}','staggered',now()+interval '10 minutes' FROM generate_series(1,5)")
assert capacity() == 5
query(f"INSERT INTO booking_holds(store_id,vehicle_model_id,pickup_datetime,dropoff_datetime,session_token,expires_at) VALUES ('capacity','bike','{window_start}','{window_end}','checkout',now()+interval '10 minutes')")
assert capacity() == 4
print('PASS: staggered reservations and holds admit a full-window checkout')

# Exact-vehicle conflicts are protected even when partner allocations are off.
query("INSERT INTO stores VALUES ('plain'); INSERT INTO fleet SELECT 'plain-v'||n,'plain','bike','Available' FROM generate_series(1,3) n;")
def assigned_order(key, vehicle='plain-v1', start=early_start, end=early_end):
    return f"BEGIN; INSERT INTO orders VALUES ('{key}','plain',NULL,'active','{key}'); INSERT INTO order_items(id,store_id,order_id,vehicle_id,pickup_datetime,dropoff_datetime) VALUES ('{key}-item','plain','{key}','{vehicle}','{start}','{end}'); COMMIT;"
assert query("SELECT coalesce((SELECT enabled FROM partner_allocation_settings WHERE store_id='plain'),false)") == 'f'
query(assigned_order('plain-first'))
query(assigned_order('plain-conflict'), success=False)
assert query("SELECT count(*) FROM orders WHERE id='plain-conflict'") == '0'
query(assigned_order('handover-conflict', start='2027-05-02T09:29:00+08:00', end=late_end), success=False)
query(assigned_order('handover-ok', start='2027-05-02T09:30:00+08:00', end=late_end))
# A date edit ignores its own item, then rejects a genuine overlapping extension.
query("UPDATE order_items SET dropoff_datetime=dropoff_datetime-interval '1 minute' WHERE id='plain-first-item'")
query("UPDATE order_items SET dropoff_datetime='2027-05-02T09:01:00+08:00' WHERE id='plain-first-item'", success=False)
assert query("SELECT extract(minute FROM dropoff_datetime AT TIME ZONE 'Asia/Manila') FROM order_items WHERE id='plain-first-item'") == '59'

# Competing staff transactions cannot assign the same bike.
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    races = list(pool.map(lambda key: subprocess.run([psql,url,'-X','-q','-v','ON_ERROR_STOP=1'], input=assigned_order(key, vehicle='plain-v2').replace('COMMIT;', "SELECT pg_sleep(0.2); COMMIT;"), text=True, capture_output=True), ['race-a','race-b']))
assert sum(r.returncode == 0 for r in races) == 1, [r.stderr for r in races]
assert any('VEHICLE_UNAVAILABLE' in r.stderr for r in races)
assert query("SELECT count(*) FROM order_items WHERE vehicle_id='plain-v2'") == '1'

# A pending walk-in can become an active rental without conflicting with itself.
query(f"INSERT INTO orders_raw(store_id,vehicle_model_id,vehicle_id,pickup_datetime,dropoff_datetime,booking_channel,order_reference) VALUES ('plain','bike','plain-v3','{early_start}','{early_end}','walk_in','OWN-RAW')")
query(assigned_order('pending-conflict', vehicle='plain-v3'), success=False)
query(f"BEGIN; INSERT INTO orders VALUES ('converted','plain',NULL,'active','OWN-RAW'); INSERT INTO order_items(id,store_id,order_id,vehicle_id,pickup_datetime,dropoff_datetime) VALUES ('converted-item','plain','converted','plain-v3','{early_start}','{early_end}'); UPDATE orders_raw SET status='processed' WHERE order_reference='OWN-RAW'; COMMIT;")
assert query("SELECT count(*) FROM allocation_booking_sources WHERE vehicle_id='plain-v3'") == '1'
query("UPDATE orders SET status='cancelled' WHERE id='converted'")
query(assigned_order('after-cancellation', vehicle='plain-v3'))

# Open-ended owner use and non-rentable fleet statuses also apply without allocations.
query("INSERT INTO fleet_unavailability(store_id,vehicle_id,starts_at,ends_at) VALUES ('plain','plain-v3','2027-06-01T09:00:00+08:00',NULL)")
query(assigned_order('owner-conflict', vehicle='plain-v3', start='2027-06-02T09:00:00+08:00', end='2027-06-03T09:00:00+08:00'), success=False)
query("UPDATE fleet_unavailability SET cancelled_at=now() WHERE vehicle_id='plain-v3'")
query("UPDATE fleet SET status='Under Maintenance' WHERE id='plain-v3'")
query(assigned_order('maintenance-conflict', vehicle='plain-v3', start=late_start, end=late_end), success=False)
print('PASS: mandatory assignment guard, concurrent staff race, atomic rollback, self edits, handover, raw conversion, cancellation and owner use')
