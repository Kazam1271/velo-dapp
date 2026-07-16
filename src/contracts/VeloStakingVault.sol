// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * VeloStakingVault — non-custodial HBAR staking.
 *
 * Users lock HBAR in this contract to earn daily Velo XP (tracked off-chain
 * by the Velo XP engine). There is deliberately NO owner and NO admin
 * function: nobody but the staker can ever move a staker's HBAR, and the
 * only exit is `unstake`, which pays the caller back from their own balance.
 *
 * Note: on Hedera, msg.value inside the EVM is denominated in tinybars
 * (8 decimals), so all amounts here are tinybars.
 */
contract VeloStakingVault {
    mapping(address => uint256) public stakedOf;
    uint256 public totalStaked;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);

    function stake() external payable {
        require(msg.value > 0, "Must stake HBAR");
        stakedOf[msg.sender] += msg.value;
        totalStaked += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    function unstake(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        uint256 balance = stakedOf[msg.sender];
        require(balance >= amount, "Insufficient staked balance");

        // Effects before interaction — no reentrancy window.
        stakedOf[msg.sender] = balance - amount;
        totalStaked -= amount;

        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "HBAR send failed");

        emit Unstaked(msg.sender, amount);
    }
}
