// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

contract Vault {
    IERC20 public immutable token;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    uint256 private constant DEAD_SHARES = 1000;
    address private constant DEAD_ADDRESS = address(0xdead);

    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private locked = NOT_ENTERED;

    error ZeroAmount();
    error ZeroShares();
    error AmountTooSmall();
    error TransferFailed();
    error Reentrancy();

    event Deposit(address indexed caller, uint256 amount, uint256 shares);
    event Withdraw(address indexed caller, uint256 shares, uint256 amount);

    modifier nonReentrant() {
        if (locked != NOT_ENTERED) revert Reentrancy();
        locked = ENTERED;
        _;
        locked = NOT_ENTERED;
    }

    constructor(address _token) {
        token = IERC20(_token);
    }

    function _mint(address _to, uint256 _shares) private {
        totalSupply += _shares;
        balanceOf[_to] += _shares;
    }

    function _burn(address _from, uint256 _shares) private {
        totalSupply -= _shares;
        balanceOf[_from] -= _shares;
    }

    function deposit(uint256 _amount) external nonReentrant returns (uint256 shares) {
        if (_amount == 0) revert ZeroAmount();

        uint256 _totalSupply = totalSupply;

        if (_totalSupply == 0) {
            if (_amount <= DEAD_SHARES) revert AmountTooSmall();
            _mint(DEAD_ADDRESS, DEAD_SHARES);
            shares = _amount - DEAD_SHARES;
        } else {
            shares = (_amount * _totalSupply) / token.balanceOf(address(this));
        }

        if (shares == 0) revert ZeroShares();

        _mint(msg.sender, shares);

        if (!token.transferFrom(msg.sender, address(this), _amount)) revert TransferFailed();

        emit Deposit(msg.sender, _amount, shares);
    }

    function withdraw(uint256 _shares) external nonReentrant returns (uint256 amount) {
        if (_shares == 0) revert ZeroShares();

        amount = (_shares * token.balanceOf(address(this))) / totalSupply;

        _burn(msg.sender, _shares);

        if (!token.transfer(msg.sender, amount)) revert TransferFailed();

        emit Withdraw(msg.sender, _shares, amount);
    }
}
