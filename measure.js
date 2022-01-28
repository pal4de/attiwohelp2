const iconv = require("iconv-lite");
const fs = require("fs");
const cliProgress = require('cli-progress');
const { assert } = require("console");
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

class Csv {
  constructor(name, header) {
    this.length = header.length;
    this.name = name;
    this.body = header.join() + "\n";
  }

  add(...values) {
    if (values.length != this.length) {
      throw new Error("カラムの長さが一致しません");
    }
    this.body += values.join() + "\n";
  }

  writeOut() {
    const writer = fs.createWriteStream(`result/${this.name}.csv`);
    writer.write(iconv.encode(this.body, "Shift_JIS"));
    writer.end();
  }
}

const withProgress = (count, f) => {
  return async () => {
    const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progress.start(count, 0);
    await f(() => progress.increment());
    progress.stop();
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

    it("amountと手数料の関係", withProgress(50, async (increment) => {
      const csv = new Csv("amount", ["販売個数", "引き出し金額", "販売者の残高の変動量", "取引手数料"]);
      for (let amount = 1; amount <= 100; amount += 2) {
        const instance = await newInstance();
        const params = { nonce: 1, amount };
        const [expected, actual, txFee] = await tx(instance, params);

        csv.add(amount, weiToYen(expected), weiToYen(actual), weiToYen(txFee));
        increment();
      }
      csv.writeOut();
    }));

    it("nonceと手数料の関係", withProgress(50, async (increment) => {
      const csv = new Csv("nonce", ["ナンス", "引き出し金額", "販売者の残高の変動量", "取引手数料"]);
      for (let nonce = 1; nonce <= 100; nonce += 2) {
        const instance = await newInstance();
        const params = { nonce, amount: 1 };
        const [expected, actual, txFee] = await tx(instance, params);

        csv.add(nonce, weiToYen(expected), weiToYen(actual), weiToYen(txFee));
        increment();
      }
      csv.writeOut();
    }));

    it("単価と手数料の関係", withProgress(50, async (increment) => {
      const csv = new Csv("unitPrice", ["単価", "引き出し金額", "販売者の残高の変動量", "取引手数料"]);
      for (let unitPrice = 0; unitPrice < 50; unitPrice += 1) {
        const instance = await newInstance();
        const params = { nonce: 1, amount: 1 };
        const [expected, actual, txFee] = await tx(instance, params);

        csv.add(unitPrice, weiToYen(expected), weiToYen(actual), weiToYen(txFee));
        increment();
      }
      csv.writeOut();
    }));

    it("継続的な取引と手数料の関係 (1つずつ)", withProgress(50, async (increment) => {
      const instance = await newInstance();
      const parameter = new Parameter();

      const csv = new Csv("sequential-01", ["販売個数", "引き出し金額", "販売者の残高の変動量", "取引手数料"]);
      for (let nonce = 1; nonce <= 100; nonce += 2) {
        const params = parameter.gen(2);
        const [expected, actual, txFee] = await tx(instance, params, 1);

        csv.add(params.amount, weiToYen(expected), weiToYen(actual), weiToYen(txFee));
        increment();
      }
      csv.writeOut();
    }));

    it("継続的な取引と手数料の関係 (5つずつ)", withProgress(20, async (increment) => {
      const instance = await newInstance();
      const parameter = new Parameter();

      const csv = new Csv("sequential-05", ["販売個数", "引き出し金額", "販売者の残高の変動量", "取引手数料"]);
      for (let nonce = 1; nonce <= 20; nonce++) {
        const params = parameter.gen(5);
        const [expected, actual, txFee] = await tx(instance, params, 5);

        csv.add(params.amount, weiToYen(expected), weiToYen(actual), weiToYen(txFee));
        increment();
      }
      csv.writeOut();
    }));

    it("継続的な取引と手数料の関係 (10ずつ)", withProgress(10, async (increment) => {
      const instance = await newInstance();
      const parameter = new Parameter();

      const csv = new Csv("sequential-10", ["販売個数", "引き出し金額", "販売者の残高の変動量", "取引手数料"]);
      for (let nonce = 1; nonce <= 10; nonce++) {
        const params = parameter.gen(10);
        const [expected, actual, txFee] = await tx(instance, params, 10);

        csv.add(params.amount, weiToYen(expected), weiToYen(actual), weiToYen(txFee));
        increment();
      }
      csv.writeOut();
    }));

    it("単価と損益分岐点の関係", async () => {
      const multibar = new cliProgress.MultiBar({}, cliProgress.Presets.shades_classic);
      const unitPriceProgress = multibar.create(51, 1);

      const csv = new Csv("surplus", ["単価", "販売個数"]);
      for (let unitPrice = 0.1; unitPrice <= 5; unitPrice += 0.1) {
        const upperLimit = Math.floor(50 / unitPrice);
        const amountProgress = multibar.create(upperLimit, 1);

        for (let amount = 1; amount <= upperLimit; amount++) {
          const instance = await newInstance(unitPrice);
          const params = { amount, nonce: amount };
          const [expected, actual, txFee] = await tx(instance, params);

          if (actual > 0) {
            csv.add(unitPrice, amount);
            break;
          } else {
            amountProgress.update(amount);
            if (amount == upperLimit) assert.failed();
          }
        }

        multibar.remove(amountProgress);
        unitPriceProgress.increment();
      }
      csv.writeOut();
      multibar.stop();
    });
  });
});
