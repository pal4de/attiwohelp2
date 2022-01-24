const IoTMicroPayment = artifacts.require("IoTMicropayment");

const BN = (val) => new web3.utils.BN(val);

module.exports = function (deployer) {
  const calcUnitPrice = (ethInYen_, unitPriceInYen_) => {
    const unitPriceInMilliYen = BN(unitPriceInYen_ * 1000);

    const ethInYen = BN(ethInYen_);
    const ethInWei = web3.utils.toWei(BN(1), "ether");
    const yenInWei = ethInWei.div(ethInYen);

    return unitPriceInMilliYen.mul(yenInWei).div(BN(1000));
  }

  const ethInYen = 277852; // 2022年1月24日 12:20現在 BitFlyerにて
  const unitPriceInYen = 500;

  const unitPrice = calcUnitPrice(ethInYen, unitPriceInYen);
  const args = [
    "0xb7E478a1b92C8312CE298Fd1F7500ed8BEDD4DA7", // accounts[1]
    30 * 24 * 60 * 60,
    unitPrice
  ];
  const options = { value: unitPrice.mul(BN(100)) };
  deployer.deploy(IoTMicroPayment, ...args, options);
};
