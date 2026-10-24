const generateCertificate = (studentName, courseName, completionDate) => {
  // Mock certificate generation function
  return {
    certificateId: `CERT-${Date.now()}`,
    studentName,
    courseName,
    completionDate,
    issuedDate: new Date().toISOString()
  };
};

module.exports = generateCertificate;
