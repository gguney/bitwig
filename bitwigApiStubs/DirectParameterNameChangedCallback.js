/* API Version - 2.3.1 */

function DirectParameterNameChangedCallback() {}

DirectParameterNameChangedCallback.prototype = new Callback();
DirectParameterNameChangedCallback.prototype.constructor = DirectParameterNameChangedCallback;

/**
 * @param {string} id
 * @param {string} name
 */
DirectParameterNameChangedCallback.prototype.directParameterNameChanged = function(id, name) {};
