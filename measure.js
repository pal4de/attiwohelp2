const IoTMicropayment = artifacts.require("IoTMicropayment");
var fs = require("fs");

class Parameter {
  constructor() {
    this.nonce = 0;
    this.amount = 0;
  }

  gen(amount, nonce = null) {
    this.amount += amount;
    return {
      nonce: nonce ?? this.nonce++,
      amount: this.amount,
    };
  }
}

const ethInYen = 277852; // 2022年1月24日 12:20現在 BitFlyerにて
const unitPriceInYen = 0.5;

const BN = (x) => new web3.utils.BN(x);

const balanceOf = async (address) => BigInt(await web3.eth.getBalance(address));

const genArgs = () => {
  const calcUnitPrice = (ethInYen_, unitPriceInYen_) => {
    const unitPriceInMilliYen = BN(unitPriceInYen_ * 1000);

    const ethInYen = BN(ethInYen_);
    const ethInWei = web3.utils.toWei(BN(1), "ether");
    const yenInWei = ethInWei.div(ethInYen);

    return unitPriceInMilliYen.mul(yenInWei).div(BN(1000));
  }

  const unitPrice = calcUnitPrice(ethInYen, unitPriceInYen);
  const options = { value: unitPrice.mul(BN(10000)) };
  return [
    "0xb7E478a1b92C8312CE298Fd1F7500ed8BEDD4DA7", // accounts[1]
    // 30 * 24 * 60 * 60,
    0, // タイムアウトのテストのため
    unitPrice,
    options
  ];
}
const args = genArgs();

contract("IoTMicropayment", ([buyer, seller, ...accounts]) => {
  describe("System", async () => {
    const actBuyer = async (instance, { amount, nonce }) => {
      const hash = web3.utils.soliditySha3(
        { t: "address", v: buyer },
        { t: "uint256", v: amount },
        { t: "uint256", v: nonce },
        { t: "address", v: instance.address }
      ).toString("hex");
      return await web3.eth.sign(hash, buyer);
    }

    const actSeller = async (instance, { amount, nonce }, signature) => {
      const options = {
        from: seller,
        gasPrice: web3.utils.toWei("1", "gwei"),
      };
      const result = await instance.claimPayment(amount, nonce, signature, options);
      return result;
    }

    const test = async (instance, params) => {
      const balanceBefore = await balanceOf(seller);
      const signature = await actBuyer(instance, params);
      const result = await actSeller(instance, params, signature);
      const balanceAfter = await balanceOf(seller);

      const expected = BigInt(params.amount) * BigInt(await instance.unitPrice());
      const actual = BigInt(balanceAfter) - BigInt(balanceBefore);
      const txFee = expected - actual;
      return [expected, actual, txFee];
    }

    it("amountと手数料の関係", async () => {
      let csv = "amount, expected earnings, actual earning, tx fee\n";
      for (let amount = 1; amount <= 80; amount++) {
        const instance = await IoTMicropayment.new(...args);
        const params = { nonce: 1, amount };
        const [expected, actual, txFee] = await test(instance, params);

        const row = [
          amount,
          expected,
          actual,
          txFee,
        ]
        csv += `${row.join(", ")}\n`;
      }

      fs.writeFileSync("result/amount-txFee.csv", csv);
    });

    it("nonceと手数料の関係", async () => {
      let csv = "nonce, expected earnings, actual earning, tx fee\n";
      for (let nonce = 1; nonce <= 80; nonce++) {
        const instance = await IoTMicropayment.new(...args);
        const params = { nonce, amount: 1 };
        const [expected, actual, txFee] = await test(instance, params);

        const row = [
          nonce,
          expected,
          actual,
          txFee,
        ]
        csv += `${row.join(", ")}\n`;
      }

      fs.writeFileSync("result/nonce-txFee.csv", csv);
    });

    it("nonceと手数料の関係 (同一コントラクト)", async () => {
      const instance = await IoTMicropayment.new(...args);
      const parameter = new Parameter();

      let csv = "nonce, expected earnings, actual earning, tx fee\n";
      for (let nonce = 1; nonce <= 80; nonce++) {
        const params = parameter.gen(1);
        const [expected, actual, txFee] = await test(instance, params);

        const row = [
          nonce,
          expected,
          actual,
          txFee,
        ]
        csv += `${row.join(", ")}\n`;
      }

      fs.writeFileSync("result/nonce-txFee-single.csv", csv);
    });
  });
});