import otp from './object.js';
import { addPrefix } from '../../functions/addPrefix.js';

export default ({ addComponents, prefix = '' }) => {
  const prefixedotp = addPrefix(otp, prefix);
  addComponents({ ...prefixedotp });
};
