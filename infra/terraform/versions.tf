terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.100.0"
    }
  }
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags {
    tags = { Project = var.name, ManagedBy = "terraform" }
  }
}

provider "aws" {
  alias  = "billing"
  region = "us-east-1"
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
locals {
  region        = "ap-southeast-1"
  account       = data.aws_caller_identity.current.account_id
  partition     = data.aws_partition.current.partition
  parameter_arn = "arn:${local.partition}:ssm:${local.region}:${local.account}:parameter/${var.name}/runtime"
}
