
function replacer(key, value) {
    if (value instanceof Map)
        return Object.fromEntries(value.entries());

    else if (value instanceof Set)
        return Array.from(value);

    else if (typeof(value) === 'string' || value instanceof String)
        return value.replace(/(?:\r\n|\r|\n)/g, "\n");

    else
        return value;
}

module.exports.serialize = (roster, spaces = 0) =>  {
    return JSON.stringify(roster, replacer, spaces)
}