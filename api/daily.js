const { getCloud } = require('../server/cloud.cjs');
const { createHandler } = require('../server/http.cjs');
module.exports = createHandler({ getCloud });
