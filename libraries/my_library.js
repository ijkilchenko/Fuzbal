function sanitize1(str) {
       // remove any "bad" character and lower case everything remaining and trim
       return str.replace(/[^a-zA-Z0-9" ]/g, "").toLowerCase().trim();
}

function sanitize2(str) {
       return str.replace(/[^a-zA-Z0-9 ]/g, "").toLowerCase().trim();
}
