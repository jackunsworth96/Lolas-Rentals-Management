export const COMPANY_STORE_ID = 'company';
export const DEFAULT_STORE_ID = 'store-lolas';
const SOURCE_TO_STORE = {
    bass: 'store-bass',
    lolas: 'store-lolas',
};
const STORE_TO_SOURCE = {
    'store-bass': 'bass',
    'store-lolas': 'lolas',
};
export function resolveStoreFromSource(source) {
    return SOURCE_TO_STORE[source] ?? DEFAULT_STORE_ID;
}
export function resolveSourceFromStore(storeId) {
    return STORE_TO_SOURCE[storeId] ?? 'lolas';
}
//# sourceMappingURL=store-mapping.js.map