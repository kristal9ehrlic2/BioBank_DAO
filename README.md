# BioBank DAO: A Decentralized Bio-Data Bank for DeSci

BioBank DAO facilitates a revolutionary approach to bio-data management by leveraging **Zama's Fully Homomorphic Encryption technology**. This decentralized bio-data bank allows data contributors, such as patients, and researchers to collaboratively govern and utilize encrypted health and genetic data while ensuring privacy and security.

## The Challenge We Face 

In the field of medical research and biotechnology, privacy is paramount. Traditional methods of collecting and using sensitive health information pose significant security risks and ethical challenges. Data contributors are often reluctant to share their personal information due to concerns over misuse. This leads to underutilization of valuable data that could drive breakthroughs in healthcare and research.

## How Does FHE Solve It? 

BioBank DAO addresses these privacy challenges through the implementation of **Fully Homomorphic Encryption (FHE)**, allowing researchers to perform computations on encrypted data without ever exposing the underlying sensitive information. Using **Zama's open-source libraries**, including **Concrete** and the **zama-fhe SDK**, BioBank DAO provides a secure environment for both data contributors and researchers, where the terms of data usage are governed by a democratic DAO structure. This innovative setup ensures that profits derived from research inquiries are fairly distributed back to the data contributors.

## Key Features 

- **FHE Encryption of User Bio-data**: All health and genetic information uploaded by users is securely encrypted using FHE, ensuring that their privacy is uncompromised.
- **DAO Governance**: The data usage protocols and pricing mechanisms are determined through a transparent voting process among DAO members, including both data contributors and researchers.
- **Homomorphic Computing for Research Queries**: Researchers can conduct valuable analyses on the encrypted data without ever accessing sensitive information, thus maintaining confidentiality.
- **Automated Profit Distribution**: Profits generated from research inquiries are automatically distributed to data contributors through DeFi protocols, ensuring fair compensation for their contributions.
- **User-Friendly Dashboard**: A streamlined portal allows users to submit their bio-data and monitor DAO treasury transactions easily.

## Technology Stack 

- **Zama FHE SDK**: The core technology enabling confidential computation.
- **Node.js**: A JavaScript runtime for building scalable network applications.
- **Hardhat/Foundry**: Development environments for compiling and testing smart contracts.

## Directory Structure 

Here’s an overview of the project structure:

```
BioBank_DAO/
├── contracts/
│   ├── BioBank_DAO.sol
├── scripts/
│   ├── deploy.js
│   ├── queryResearch.js
├── test/
│   ├── BioBank_DAO.test.js
├── package.json
└── README.md
```

## Installation Guide 

To set up the BioBank DAO project, please follow these steps:

1. **Ensure you have Node.js installed**: Check if Node.js is installed on your system. If not, download and install it from the official website.
   
2. **Install Hardhat or Foundry**: Depending on your preferred development environment, you may need to install Hardhat or Foundry.

3. **Download the project files**: Please ensure you have the complete project file on your local machine (do not use `git clone`).

4. **Install dependencies**: Navigate to the project directory and run the following command to install all necessary libraries, including Zama's FHE libraries:
   ```bash
   npm install
   ```

## Build & Run Guide 

Once you've completed the installation, you can proceed with the following commands to build and run the BioBank DAO project:

### Compile the Smart Contracts

To compile the smart contracts, use:
```bash
npx hardhat compile
```

### Run Tests 

Testing is crucial for ensuring your contracts work as intended. Run the tests with:
```bash
npx hardhat test
```

### Deploy the Smart Contract

To deploy the BioBank DAO smart contract, run:
```bash
npx hardhat run scripts/deploy.js --network <your_network_name>
```

### Query Research 

Researchers can run a homomorphic query with the following command:
```bash
node scripts/queryResearch.js <query_parameters>
```

## Powered by Zama 

We would like to extend our sincerest gratitude to the Zama team for their pioneering work in fully homomorphic encryption and the open-source tools that make confidential blockchain applications like BioBank DAO possible. Their innovation enables us to provide a secure and ethical platform for managing sensitive bio-data, empowering both data contributors and researchers alike. 

Together, we can revolutionize the future of healthcare research while prioritizing privacy and ethical governance.