/* This is an example code for Everynet Parser.
** Everynet send several parameters to TagoIO. The job of this parse is to convert all these parameters into a TagoIO format.
** One of these parameters is the payload of your device. We find it too and apply the appropriate sensor parse.
**
** IMPORTANT: In most case, you will only need to edit the parsePayload function.
**
** Testing:
** You can do manual tests to this parse by using the Device Emulator. Copy and Paste the following code:
** [{ "variable": "everynet_payload", "value": "{ \"params\": { \"payload\": \"0109611395\" } }" }]
**
** The ignore_vars variable in this code should be used to ignore variables
** from the device that you don't want.
*/
// Add ignorable variables in this array.
const ignore_vars = ['device_addr', 'port', 'duplicate', 'network', 'packet_hash', 'application', 'device', 'packet_id'];


/**
 * Convert an object to TagoIO object format.
 * Can be used in two ways:
 * toTagoFormat({ myvariable: myvalue , anothervariable: anothervalue... })
 * toTagoFormat({ myvariable: { value: myvalue, unit: 'C', metadata: { color: 'green' }} , anothervariable: anothervalue... })
 *
 * @param {Object} object_item Object containing key and value.
 * @param {String} serie Serie for the variables
 * @param {String} prefix Add a prefix to the variables name
 */
function toTagoFormat(object_item, serie, prefix = '') {
  const result = [];
  for (const key in object_item) {
    if (ignore_vars.includes(key)) continue;

    if (typeof object_item[key] == 'object') {
      result.push({
        variable: object_item[key].variable || `${prefix}${key}`,
        value: object_item[key].value,
        serie: object_item[key].serie || serie,
        metadata: object_item[key].metadata,
        location: object_item[key].location,
        unit: object_item[key].unit,
      });
    } else {
      result.push({
        variable: `${prefix}${key}`,
        value: object_item[key],
        serie,
      });
    }
  }

  return result;
}

/**
 *  In the solutions params is where usually latitude and longitude for your antenna signal comes from.
 * @param {Object} solutions gateway object from everynet
 * @param {String|Number} serie serie for the variables
 */
function transformSolutionParam(solutions, serie) {
  let to_tago = [];
  for (const s of solutions) {
    let convert_json = {};
    convert_json.location = { value: `${s.lat}, ${s.lng}`, location: { lat: s.lat, lng: s.lng } };
    delete s.lat;
    delete s.lng;

    convert_json = { ...convert_json, ...s };
    to_tago = to_tago.concat(toTagoFormat(convert_json, serie));
  }

  return to_tago;
}

/**
 * This is the main function to parse the payload. Everything else doesn't require your attention.
 * @param {String} payload_raw 
 * @returns {Object} containing key and value to TagoIO
 */
function parsePayload(payload_raw) {
  // If your device is sending something different than hex, like base64, just specify it bellow.
  const buffer = Buffer.from(payload_raw, 'hex');

  // Lets say you have a payload of 3 bytes.
  // 0 - Protocol Version
  // 1,2 - Temperature
  // 3,4 - Humidity
  // More information about buffers can be found here: https://nodejs.org/api/buffer.html
  const data = {
    protocol_version: buffer.slice(0,1).readInt8(),
    temperature: { value: buffer.slice(1,3).readInt16BE() / 100, unit: '°C' },
    humidity: { value: buffer.slice(3,5).readUInt16BE() / 100, unit: '%' },
  };
  
  return data;
}

// Check if what is being stored is the ttn_payload.
// Payload is an environment variable. Is where what is being inserted to your device comes in.
// Payload always is an array of objects. [ { variable, value...}, {variable, value...} ...]
let everynet_payload = payload.find(x => x.variable ==='everynet_payload');
if (everynet_payload) {
  // Get a unique serie for the incoming data.
  const serie = everynet_payload.serie || new Date().getTime();

  // Parse the everynet_payload to JSON format (it comes in a String format)
  everynet_payload = JSON.parse(everynet_payload.value);

  let vars_to_tago = [];
  if (everynet_payload.params.solutions) {
    vars_to_tago = vars_to_tago.concat(transformSolutionParam(everynet_payload.params.solutions));
  }

  if (everynet_payload.meta) {
    vars_to_tago = vars_to_tago.concat(toTagoFormat(everynet_payload.meta, serie));
  }
  
  // Find the payload raw parameter.
  let payload_raw = everynet_payload.params.payload || everynet_payload.payload_raw;
  if (payload_raw) {
    // Parse the payload from your sensor to function parsePayload
    try {
      vars_to_tago = vars_to_tago.concat(toTagoFormat(parsePayload(payload_raw), serie));
    } catch (e) {
      // Catch any error in the parse code and send to parse_error variable.
      vars_to_tago = vars_to_tago.concat({ variable: 'parse_error', value: e.message || e });
    }
  }

  payload = vars_to_tago;
}
