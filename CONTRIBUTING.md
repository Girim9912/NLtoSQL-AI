# Contributing to NLtoSQL-AI

Thank you for your interest in contributing to NLtoSQL-AI! This document provides guidelines and instructions for contributing to this project. We welcome contributions from everyone who wishes to improve and expand this AI-powered natural language to SQL translation system.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project adheres to a Code of Conduct that establishes expectations for participation in our community. By participating, you are expected to uphold this code. Please report unacceptable behavior to gmeru2@unh.newhaven.edu  or girim514@gmail.com.

We are committed to providing a welcoming and inspiring community for all.

## Getting Started

### Prerequisites

- Python 3.9+
- Git
- Basic understanding of NLP and/or SQL

### Setting Up Your Development Environment

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```
   git clone https://github.com/Girim9912/NLtoSQL-AI.git
   cd NLtoSQL-AI
   ```
3. Set up a virtual environment:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
4. Install dependencies:
   ```
   pip install -r requirements.txt
   pip install -r requirements-dev.txt  # Development dependencies
   ```
5. Add the original repository as an upstream remote:
   ```
   git remote add upstream https://github.com/Girim9912/NLtoSQL-AI.git
   ```

## Development Workflow

1. Create a new branch for your feature or bugfix:
   ```
   git checkout -b feature/your-feature-name
   ```
   or
   ```
   git checkout -b fix/issue-you-are-fixing
   ```

2. Make your changes, following our [coding standards](#coding-standards)

3. Add and commit your changes with a descriptive commit message:
   ```
   git add .
   git commit -m "Add feature: your feature description"
   ```

4. Push your branch to your fork:
   ```
   git push origin feature/your-feature-name
   ```

5. Create a Pull Request from your fork to the main repository

## Pull Request Process

1. Ensure your code follows our [coding standards](#coding-standards)
2. Update documentation as necessary
3. Add tests for new functionality
4. Ensure all tests pass
5. Fill out the pull request template completely
6. Request a review from a maintainer

Pull requests will be merged after they receive approval from at least one maintainer and pass all automated checks.

## Coding Standards

We follow PEP 8 style guidelines for Python code. Additionally:

- Use meaningful variable and function names
- Write docstrings for all functions, classes, and methods
- Keep functions focused on a single responsibility
- Comment complex code sections
- Use type hints where appropriate

We use the following tools to enforce code quality:
- Black for code formatting
- Flake8 for linting
- isort for import sorting
- mypy for type checking

You can run these tools with:
```
black .
flake8 .
isort .
mypy .
```

## Testing Guidelines

- Write unit tests for all new functionality
- Aim for high test coverage of critical components
- Run tests before submitting a PR:
  ```
  pytest
  ```

- For ML components, include both functional tests and model validation metrics

## Documentation

Good documentation is crucial for this project:

- Update README.md with new features or changes
- Document all functions, classes, and methods with docstrings
- Add examples for new functionality
- Update architecture documentation for significant changes
- Maintain updated API documentation

## Project Structure

Please adhere to the following project structure:
```
NLtoSQL-AI/
├── src/                  # Source code
│   ├── nlp/              # Natural language processing components
│   ├── sql/              # SQL generation components
│   ├── schema/           # Database schema analysis
│   └── api/              # API endpoints
├── tests/                # Test suite
├── docs/                 # Documentation
├── research/             # Research papers and notes
├── examples/             # Usage examples
└── scripts/              # Utility scripts
```

## Types of Contributions

We welcome:

- Bug fixes
- Feature additions
- Documentation improvements
- Performance optimizations
- Test coverage improvements
- UI/UX enhancements

## Community

- Join discussions in GitHub Issues
- Participate in feature planning
- Help other contributors
- Suggest improvements

## Attribution

Contributors will be acknowledged in our CONTRIBUTORS.md file and in release notes.

Thank you for contributing to NLtoSQL-AI!