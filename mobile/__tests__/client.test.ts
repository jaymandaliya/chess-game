jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(async () => false),
  resetGenericPassword: jest.fn(),
}));

import { formatRupees } from '../src/api/client';

test('formats paise as rupees without floating point surprises', () => {
  expect(formatRupees(39900)).toBe('₹399');
  expect(formatRupees(2550)).toBe('₹25.50');
  expect(formatRupees(10000000)).toBe('₹1,00,000');
});
