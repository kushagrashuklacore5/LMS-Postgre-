const { createUpload } = require("./uploadPolicy");

// Class timetable: a PDF or an image (see uploadPolicy.js for the rules)
module.exports = createUpload("timetable");
