const DECIMAL_INTEGER = /^(0|[1-9][0-9]*)$/;

// mysql2 returns BIGINT values as strings. Keep them as decimal strings at the
// model/API boundary so values above Number.MAX_SAFE_INTEGER are never rounded.
export const toUnsignedBigIntString = (value, fieldName = 'value') => {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new TypeError(`${fieldName} must be an unsigned integer`);
    return value.toString();
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`${fieldName} must be a non-negative safe integer or decimal string`);
    }
    return String(value);
  }
  if (typeof value === 'string' && DECIMAL_INTEGER.test(value)) return value;
  throw new TypeError(`${fieldName} must be an unsigned integer decimal string`);
};

export const unsignedBigIntAttribute = (DataTypes, fieldName) => ({
  type: DataTypes.BIGINT.UNSIGNED,
  allowNull: false,
  defaultValue: '0',
  get() {
    const value = this.getDataValue(fieldName);
    return value === null || value === undefined ? value : String(value);
  },
  set(value) {
    this.setDataValue(fieldName, toUnsignedBigIntString(value, fieldName));
  }
});
