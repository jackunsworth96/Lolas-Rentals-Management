import type { Vehicle, FleetRepository } from '@lolas/domain';
import { Vehicle as VehicleEntity } from '@lolas/domain';
import { getSupabaseClient } from './client.js';
import { parseDate } from './mappers.js';

interface VehicleRow {
  id: string;
  store_id: string;
  name: string;
  model_id: string | null;
  plate_number: string | null;
  engine_number: string | null;
  chassis_number: string | null;
  gps_id: string | null;
  status: string;
  current_mileage: number;
  orcr_expiry_date: string | null;
  surf_rack: boolean;
  owner: string | null;
  rentable_start_date: string | null;
  registration_date: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  set_up_costs: number;
  total_bike_cost: number;
  useful_life_months: number | null;
  salvage_value: number;
  accumulated_depreciation: number;
  book_value: number;
  date_sold: string | null;
  sold_price: number | null;
  profit_loss: number | null;
  created_at: string;
  updated_at: string;
}

function rowToVehicle(row: VehicleRow): Vehicle {
  return VehicleEntity.create({
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    modelId: row.model_id,
    plateNumber: row.plate_number,
    engineNumber: row.engine_number,
    chassisNumber: row.chassis_number,
    gpsId: row.gps_id,
    status: row.status,
    currentMileage: row.current_mileage,
    orcrExpiryDate: row.orcr_expiry_date,
    surfRack: row.surf_rack,
    owner: row.owner,
    rentableStartDate: row.rentable_start_date,
    registrationDate: row.registration_date,
    purchasePrice: row.purchase_price,
    purchaseDate: row.purchase_date,
    setUpCosts: row.set_up_costs ?? 0,
    totalBikeCost: row.total_bike_cost ?? 0,
    usefulLifeMonths: row.useful_life_months,
    salvageValue: row.salvage_value ?? 0,
    accumulatedDepreciation: row.accumulated_depreciation ?? 0,
    bookValue: row.book_value ?? 0,
    dateSold: row.date_sold,
    soldPrice: row.sold_price,
    profitLoss: row.profit_loss,
    createdAt: parseDate(row.created_at),
    updatedAt: parseDate(row.updated_at),
  });
}

function vehicleToRow(vehicle: Vehicle): Record<string, unknown> {
  return {
    id: vehicle.id,
    store_id: vehicle.storeId,
    name: vehicle.name,
    model_id: vehicle.modelId,
    plate_number: vehicle.plateNumber,
    engine_number: vehicle.engineNumber,
    chassis_number: vehicle.chassisNumber,
    gps_id: vehicle.gpsId,
    status: vehicle.status,
    current_mileage: vehicle.currentMileage,
    orcr_expiry_date: vehicle.orcrExpiryDate,
    surf_rack: vehicle.surfRack,
    owner: vehicle.owner,
    rentable_start_date: vehicle.rentableStartDate,
    registration_date: vehicle.registrationDate,
    purchase_price: vehicle.purchasePrice,
    purchase_date: vehicle.purchaseDate,
    set_up_costs: vehicle.setUpCosts,
    total_bike_cost: vehicle.totalBikeCost,
    useful_life_months: vehicle.usefulLifeMonths,
    salvage_value: vehicle.salvageValue,
    accumulated_depreciation: vehicle.accumulatedDepreciation,
    book_value: vehicle.bookValue,
    date_sold: vehicle.dateSold,
    sold_price: vehicle.soldPrice,
    profit_loss: vehicle.profitLoss,
    updated_at: vehicle.updatedAt.toISOString(),
  };
}

const NON_RENTABLE = ['Sold', 'Closed', 'Maintenance', 'Retired'];

export class SupabaseFleetRepository implements FleetRepository {
  async findById(id: string): Promise<Vehicle | null> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('fleet')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`findById failed: ${error.message}`);
    return data ? rowToVehicle(data as VehicleRow) : null;
  }

  async findAll(): Promise<Vehicle[]> {
    const sb = getSupabaseClient();
    const { data, error } = await sb.from('fleet').select('*').order('name');
    if (error) throw new Error(`findAll failed: ${error.message}`);
    return (data as VehicleRow[]).map(rowToVehicle);
  }

  async findByStore(storeId: string): Promise<Vehicle[]> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('fleet')
      .select('*')
      .eq('store_id', storeId)
      .order('name');

    if (error) throw new Error(`findByStore failed: ${error.message}`);
    return (data as VehicleRow[]).map(rowToVehicle);
  }

  async findAvailable(
    storeId: string,
    from: string,
    to: string,
  ): Promise<Vehicle[]> {
    const sb = getSupabaseClient();

    // Get IDs of vehicles already assigned to orders overlapping the range
    const { data: booked, error: bookedErr } = await sb
      .from('order_items')
      .select('vehicle_id')
      .or(`start_date.lte.${to},end_date.gte.${from}`);

    if (bookedErr) throw new Error(`findAvailable booked query failed: ${bookedErr.message}`);

    const bookedIds = (booked ?? []).map(
      (r: { vehicle_id: string }) => r.vehicle_id,
    );

    let query = sb
      .from('fleet')
      .select('*')
      .eq('store_id', storeId)
      .not('status', 'in', `(${NON_RENTABLE.join(',')})`);

    if (bookedIds.length > 0) {
      query = query.not('id', 'in', `(${bookedIds.join(',')})`);
    }

    query = query.order('name');

    const { data, error } = await query;
    if (error) throw new Error(`findAvailable failed: ${error.message}`);
    return (data as VehicleRow[]).map(rowToVehicle);
  }

  async save(vehicle: Vehicle): Promise<void> {
    const sb = getSupabaseClient();
    const row = vehicleToRow(vehicle);
    const { error } = await sb.from('fleet').upsert(row);

    if (error) throw new Error(`save failed: ${error.message}`);
  }

  async updateStatus(vehicleId: string, status: string): Promise<void> {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('fleet')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', vehicleId);

    if (error) throw new Error(`updateStatus failed: ${error.message}`);
  }

  async updateDepreciation(
    vehicleId: string,
    accumulatedDepreciation: number,
    bookValue: number,
  ): Promise<void> {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('fleet')
      .update({
        accumulated_depreciation: accumulatedDepreciation,
        book_value: bookValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vehicleId);

    if (error) throw new Error(`updateDepreciation failed: ${error.message}`);
  }
}
