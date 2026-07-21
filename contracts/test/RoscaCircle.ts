import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const CONTRIBUTION = ethers.parseUnits("50", 6); // pretend 6-decimal token, like USDT
const MEMBER_COUNT = 3;
const ROUND_DURATION = networkHelpers.time.duration.days(7);

async function deployCircle() {
  const signers = await ethers.getSigners();
  const members = signers.slice(0, MEMBER_COUNT);
  const other = signers[MEMBER_COUNT];

  const token = await ethers.deployContract("MockERC20");
  for (const member of members) {
    await token.mint(member.address, CONTRIBUTION * BigInt(MEMBER_COUNT) * 10n);
  }

  const rosca = await ethers.deployContract("RoscaCircle", [
    await token.getAddress(),
    CONTRIBUTION,
    MEMBER_COUNT,
    ROUND_DURATION,
  ]);

  const roscaAddress = await rosca.getAddress();
  for (const member of members) {
    await token.connect(member).approve(roscaAddress, ethers.MaxUint256);
  }

  return { rosca, token, members, other };
}

async function joinAll(rosca: Awaited<ReturnType<typeof deployCircle>>["rosca"], members: Awaited<ReturnType<typeof deployCircle>>["members"]) {
  for (const member of members) {
    await rosca.connect(member).join();
  }
}

describe("RoscaCircle", function () {
  describe("join()", function () {
    it("locks once memberCount members have joined", async function () {
      const { rosca, members } = await deployCircle();
      await joinAll(rosca, members);
      expect(await rosca.locked()).to.equal(true);
    });

    it("rejects joining twice", async function () {
      const { rosca, members } = await deployCircle();
      await rosca.connect(members[0]).join();
      await expect(rosca.connect(members[0]).join()).to.be.revertedWith("already joined");
    });

    it("rejects joining after the circle is full", async function () {
      const { rosca, members, other } = await deployCircle();
      await joinAll(rosca, members);
      await expect(rosca.connect(other).join()).to.be.revertedWith("circle is full");
    });

    it("emits Joined with the correct join-order index", async function () {
      const { rosca, members } = await deployCircle();
      await expect(rosca.connect(members[0]).join()).to.emit(rosca, "Joined").withArgs(members[0].address, 0n);
      await expect(rosca.connect(members[1]).join()).to.emit(rosca, "Joined").withArgs(members[1].address, 1n);
    });
  });

  describe("contribute()", function () {
    it("rejects contributing before the circle is full", async function () {
      const { rosca, members } = await deployCircle();
      await rosca.connect(members[0]).join();
      await expect(rosca.connect(members[0]).contribute()).to.be.revertedWith("circle not full yet");
    });

    it("rejects a non-member", async function () {
      const { rosca, members, other } = await deployCircle();
      await joinAll(rosca, members);
      await expect(rosca.connect(other).contribute()).to.be.revertedWith("not a member");
    });

    it("rejects contributing twice in the same round", async function () {
      const { rosca, members } = await deployCircle();
      await joinAll(rosca, members);
      await rosca.connect(members[0]).contribute();
      await expect(rosca.connect(members[0]).contribute()).to.be.revertedWith(
        "already contributed this round",
      );
    });

    it("rejects contributing after the round deadline has passed", async function () {
      const { rosca, members } = await deployCircle();
      await joinAll(rosca, members);
      await networkHelpers.time.increase(ROUND_DURATION + 1);
      await expect(rosca.connect(members[0]).contribute()).to.be.revertedWith(
        "round deadline passed, use refund",
      );
    });
  });

  describe("full rotation", function () {
    it("pays each round's pot to that round's member in join order, then completes", async function () {
      const { rosca, token, members } = await deployCircle();
      await joinAll(rosca, members);

      const potAmount = CONTRIBUTION * BigInt(MEMBER_COUNT);

      for (let round = 0; round < MEMBER_COUNT; round++) {
        const recipient = members[round];
        const balanceBefore = await token.balanceOf(recipient.address);

        for (let i = 0; i < MEMBER_COUNT; i++) {
          const member = members[i];
          const isLast = i === MEMBER_COUNT - 1;
          if (isLast) {
            await expect(rosca.connect(member).contribute())
              .to.emit(rosca, "RoundPaidOut")
              .withArgs(BigInt(round), recipient.address, potAmount);
          } else {
            await rosca.connect(member).contribute();
          }
        }

        // Net change, not the raw pot: the recipient also pays their own
        // contribution into this same round before receiving the payout.
        const balanceAfter = await token.balanceOf(recipient.address);
        expect(balanceAfter - balanceBefore).to.equal(potAmount - CONTRIBUTION);
        expect(await rosca.currentRound()).to.equal(BigInt(round + 1));
      }

      expect(await rosca.completed()).to.equal(true);
      await expect(rosca.connect(members[0]).contribute()).to.be.revertedWith("circle completed");
    });
  });

  describe("refund()", function () {
    it("rejects a refund before the deadline has passed", async function () {
      const { rosca, members } = await deployCircle();
      await joinAll(rosca, members);
      await rosca.connect(members[0]).contribute();
      await expect(rosca.connect(members[0]).refund()).to.be.revertedWith(
        "round deadline has not passed yet",
      );
    });

    it("lets a contributor reclaim their contribution after a missed deadline", async function () {
      const { rosca, token, members } = await deployCircle();
      await joinAll(rosca, members);

      const balanceBefore = await token.balanceOf(members[0].address);
      await rosca.connect(members[0]).contribute();
      // members[1] and members[2] never contribute this round.

      await networkHelpers.time.increase(ROUND_DURATION + 1);

      await expect(rosca.connect(members[0]).refund())
        .to.emit(rosca, "Refunded")
        .withArgs(members[0].address, 0n, CONTRIBUTION);

      const balanceAfter = await token.balanceOf(members[0].address);
      expect(balanceAfter).to.equal(balanceBefore);
      expect(await rosca.hasContributed(0, members[0].address)).to.equal(false);
    });

    it("rejects a refund from someone who never contributed that round", async function () {
      const { rosca, members } = await deployCircle();
      await joinAll(rosca, members);
      await rosca.connect(members[0]).contribute();
      await networkHelpers.time.increase(ROUND_DURATION + 1);
      await expect(rosca.connect(members[1]).refund()).to.be.revertedWith("nothing to refund");
    });

    it("does not auto-resume the round after a refund", async function () {
      const { rosca, members } = await deployCircle();
      await joinAll(rosca, members);
      await rosca.connect(members[0]).contribute();
      await networkHelpers.time.increase(ROUND_DURATION + 1);
      await rosca.connect(members[0]).refund();

      expect(await rosca.currentRound()).to.equal(0n);
      await expect(rosca.connect(members[0]).contribute()).to.be.revertedWith(
        "round deadline passed, use refund",
      );
    });
  });
});
