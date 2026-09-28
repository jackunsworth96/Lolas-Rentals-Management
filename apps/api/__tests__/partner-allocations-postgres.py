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
        assert result.returncode and ('ALLOCATION_CONFLICT' in result.stderr or 'Seasons must' in result.stderr or 'overlap' in result.stderr), result.stderr
    return result.stdout.strip()

query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
query((Path(__file__).parent / 'fixtures/allocation-schema.sql').read_text())
query((root / 'supabase/migrations/20260927000000_partner_allocations.sql').read_text())
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
# A newly added, unclassified model can be classified after activation.
query("INSERT INTO vehicle_models VALUES ('new-bike','New Bike',NULL,true); INSERT INTO fleet VALUES ('season-new','season','new-bike','Available')")
assert query("SELECT count(*) FROM partner_allocation_shortfalls WHERE store_id='season'") == '1'
query(f"SELECT allocation_configure('season','{other}','tester','classify','"+json.dumps({'modelId':'new-bike','modelType':'scooter'})+"'::jsonb)")
assert query("SELECT type FROM vehicle_models WHERE id='new-bike'") == 'scooter'
assert query("SELECT count(*) FROM partner_allocation_shortfalls WHERE store_id='season'") == '0'
print('PASS: rollout, concurrency, pool protection, cancellation and return, hold conversion/retry, activation, edit rollback, fleet loss, cross-date segments, seasonal schedule, atomic groups, staff activation, partner deactivation, owner-use cancellation, post-activation classification')
