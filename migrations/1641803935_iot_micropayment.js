const IoTMicroPayment = artifacts.require("IoTMicropayment");

module.exports = function (deployer) {
  const unitPrice = 50;
  // Use deployer to state migration tasks.
  const args = [
    "0xb7E478a1b92C8312CE298Fd1F7500ed8BEDD4DA7", // 2つ目のアカウント
    30 * 24 * 60 * 60,
    unitPrice
  ];
  const options = { value: unitPrice * 100 };
  deployer.deploy(IoTMicroPayment, ...args, options);
};
