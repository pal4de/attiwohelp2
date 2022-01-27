var fs = require("fs");
const cliProgress = require('cli-progress');
const IoTMicropayment = artifacts.require("IoTMicropayment");

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

const BN = (x) => new web3.utils.BN(x);

const balanceOf = async (address) => BigInt(await web3.eth.getBalance(address));

const weiToYen = (wei) => parseFloat(web3.utils.fromWei(`${wei}`, "ether")) * ethInYen;

contract("IoTMicropayment", ([buyer, seller, ...accounts]) => {
  describe("System", async () => {
    const newInstance = async (unitPriceInYen = 0.5) => {
      const calcUnitPrice = (ethInYen_, unitPriceInYen_) => {
        const unitPriceInMilliYen = BN(unitPriceInYen_ * 1000);

        const ethInYen = BN(ethInYen_);
        const ethInWei = web3.utils.toWei(BN(1), "ether");
        const yenInWei = ethInWei.div(ethInYen);

        return unitPriceInMilliYen.mul(yenInWei).div(BN(1000));
      }

      const unitPrice = calcUnitPrice(ethInYen, unitPriceInYen);
      const timeout = 0;
      const options = { value: unitPrice.mul(BN(10000)) };

      return await IoTMicropayment.new(
        seller,
        timeout,
        unitPrice,
        options
      );
    }

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

    const tx = async (instance, params, amount = null) => {
      const balanceBefore = await balanceOf(seller);
      const signature = await actBuyer(instance, params);
      const result = await actSeller(instance, params, signature);
      const balanceAfter = await balanceOf(seller);

      const expected = BigInt(amount ?? params.amount) * BigInt(await instance.unitPrice());
      const actual = BigInt(balanceAfter) - BigInt(balanceBefore);
      const txFee = expected - actual;
      return [expected, actual, txFee];
    }

    it("amountと手数料の関係", async () => {
      const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      progress.start(80, 1);

      let csv = "amount, expected earnings, actual earning, tx fee, expected earnings (yen), actual earning (yen), tx fee (yen)\n";
      for (let amount = 1; amount <= 80; amount++) {
        const instance = await newInstance();
        const params = { nonce: 1, amount };
        const [expected, actual, txFee] = await tx(instance, params);

        const row = [
          amount,
          expected,
          actual,
          txFee,
          weiToYen(expected),
          weiToYen(actual),
          weiToYen(txFee),
        ]
        csv += `${row.join(", ")}\n`;

        progress.increment();
      }
      fs.writeFileSync("result/amount.csv", csv);
      progress.stop();
    });

    it("nonceと手数料の関係", async () => {
      const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      progress.start(80, 1);

      let csv = "nonce, expected earnings, actual earning, tx fee, expected earnings (yen), actual earning (yen), tx fee (yen)\n";
      for (let nonce = 1; nonce <= 80; nonce++) {
        const instance = await newInstance();
        const params = { nonce, amount: 1 };
        const [expected, actual, txFee] = await tx(instance, params);

        const row = [
          nonce,
          expected,
          actual,
          txFee,
          weiToYen(expected),
          weiToYen(actual),
          weiToYen(txFee),
        ]
        csv += `${row.join(", ")}\n`;

        progress.increment();
      }
      fs.writeFileSync("result/nonce.csv", csv);
      progress.stop();
    });

    it("単価と手数料の関係", async () => {
      const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      progress.start(102, 1);

      let csv = "unit price (yen), expected earnings, actual earning, tx fee, expected earnings (yen), actual earning (yen), tx fee (yen)\n";
      for (let unitPrice = 0; unitPrice < 50; unitPrice += 0.5) {
        const instance = await newInstance();
        const params = { nonce: 1, amount: 1 };
        const [expected, actual, txFee] = await tx(instance, params);

        const row = [
          unitPrice,
          expected,
          actual,
          txFee,
          weiToYen(expected),
          weiToYen(actual),
          weiToYen(txFee),
        ]
        csv += `${row.join(", ")}\n`;

        progress.increment();
      }
      fs.writeFileSync("result/unitPrice.csv", csv);
      progress.stop();
    });

    it("継続的な取引と手数料の関係 (1つずつ)", async () => {
      const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      progress.start(80, 1);

      const instance = await newInstance();
      const parameter = new Parameter();

      let csv = "nonce, expected earnings, actual earning, tx fee, expected earnings (yen), actual earning (yen), tx fee (yen)\n";
      for (let nonce = 1; nonce <= 80; nonce++) {
        const params = parameter.gen(1);
        const [expected, actual, txFee] = await tx(instance, params, 1);

        const row = [
          nonce,
          expected,
          actual,
          txFee,
          weiToYen(expected),
          weiToYen(actual),
          weiToYen(txFee),
        ]
        csv += `${row.join(", ")}\n`;

        progress.increment();
      }
      fs.writeFileSync("result/sequential-01.csv", csv);
      progress.stop();
    });

    it("継続的な取引と手数料の関係 (5つずつ)", async () => {
      const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      progress.start(16, 1);

      const instance = await newInstance();
      const parameter = new Parameter();

      let csv = "nonce, expected earnings, actual earning, tx fee, expected earnings (yen), actual earning (yen), tx fee (yen)\n";
      for (let nonce = 1; nonce <= 16; nonce++) {
        const params = parameter.gen(5);
        const [expected, actual, txFee] = await tx(instance, params, 5);

        const row = [
          nonce,
          expected,
          actual,
          txFee,
          weiToYen(expected),
          weiToYen(actual),
          weiToYen(txFee),
        ]
        csv += `${row.join(", ")}\n`;

        progress.increment();
      }
      fs.writeFileSync("result/sequential-05.csv", csv);
      progress.stop();
    });

    it("継続的な取引と手数料の関係 (10ずつ)", async () => {
      const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      progress.start(8, 1);

      const instance = await newInstance();
      const parameter = new Parameter();

      let csv = "nonce, expected earnings, actual earning, tx fee, expected earnings (yen), actual earning (yen), tx fee (yen)\n";
      for (let nonce = 1; nonce <= 8; nonce++) {
        const params = parameter.gen(10);
        const [expected, actual, txFee] = await tx(instance, params, 10);

        const row = [
          nonce,
          expected,
          actual,
          txFee,
          weiToYen(expected),
          weiToYen(actual),
          weiToYen(txFee),
        ]
        csv += `${row.join(", ")}\n`;

        progress.increment();
      }
      fs.writeFileSync("result/sequential-10.csv", csv);
      progress.stop();
    });
  });
});
