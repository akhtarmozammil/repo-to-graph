import unittest
from backend.app.parsers.go import GoParser
from backend.app.parsers.java import JavaParser
from backend.app.parsers.ruby import RubyParser
from backend.app.parsers.php import PhpParser
from backend.app.parsers.terraform import TerraformParser

class TestGoParser(unittest.TestCase):
    def setUp(self):
        self.parser = GoParser()

    def test_parse_struct_and_functions(self):
        code = r"""
        package main
        import (
            "fmt"
            "database/sql"
        )
        
        type User struct {
            ID   int
            Name string
        }
        
        func (u *User) Save(db *sql.DB) error {
            query := "INSERT INTO users (name) VALUES (?)"
            _, err := db.Exec(query)
            return err
        }
        
        func main() {
            fmt.Println("Hello Go")
            u := &User{Name: "Alice"}
            router.GET("/api/users", u.Save)
        }
        """
        res = self.parser.parse(code, "main.go")
        
        # Verify Class (Struct)
        class_names = [c["name"] for c in res["classes"]]
        self.assertIn("User", class_names)
        
        # Verify Functions & Receiver Methods
        func_names = [f["name"] for f in res["functions"]]
        self.assertIn("main", func_names)
        self.assertIn("Save", func_names)
        
        # Check receiver class association
        save_func = next(f for f in res["functions"] if f["name"] == "Save")
        self.assertEqual(save_func["class_name"], "User")
        self.assertTrue(save_func["is_method"])
        
        # Verify Imports
        imports = [i["module"] for i in res["imports"]]
        self.assertIn("fmt", imports)
        self.assertIn("database/sql", imports)
        
        # Verify DB Query
        queries = res["db_queries"]
        self.assertEqual(len(queries), 1)
        self.assertEqual(queries[0]["table"], "users")
        self.assertEqual(queries[0]["operation"], "INSERT")

        # Verify API route extraction
        apis = res["apis"]
        self.assertEqual(len(apis), 1)
        self.assertEqual(apis[0]["method"], "GET")
        self.assertEqual(apis[0]["path"], "/api/users")


class TestJavaParser(unittest.TestCase):
    def setUp(self):
        self.parser = JavaParser()

    def test_parse_java_class(self):
        code = r"""
        package com.example;
        import java.util.List;
        import org.springframework.web.bind.annotation.GetMapping;
        
        public class UserController {
            @GetMapping("/users")
            public List<String> getUsers() {
                String sql = "SELECT name FROM users WHERE id = 1";
                return db.query(sql);
            }
        }
        """
        res = self.parser.parse(code, "UserController.java")
        
        # Verify Class
        class_names = [c["name"] for c in res["classes"]]
        self.assertIn("UserController", class_names)
        
        # Verify Method
        func_names = [f["name"] for f in res["functions"]]
        self.assertIn("getUsers", func_names)
        get_users = next(f for f in res["functions"] if f["name"] == "getUsers")
        self.assertEqual(get_users["class_name"], "UserController")
        self.assertTrue(get_users["is_method"])
        
        # Verify API annotation endpoint
        apis = res["apis"]
        self.assertEqual(len(apis), 1)
        self.assertEqual(apis[0]["method"], "GET")
        self.assertEqual(apis[0]["path"], "/users")

        # Verify DB queries
        queries = res["db_queries"]
        self.assertEqual(len(queries), 1)
        self.assertEqual(queries[0]["table"], "users")
        self.assertEqual(queries[0]["operation"], "SELECT")


class TestRubyParser(unittest.TestCase):
    def setUp(self):
        self.parser = RubyParser()

    def test_parse_ruby_class(self):
        code = r"""
        require 'sinatra'
        
        class AppController
          def index
            sql = "SELECT * FROM orders"
            db.execute(sql)
          end
        end
        
        get '/orders' do
          AppController.new.index
        end
        """
        res = self.parser.parse(code, "app.rb")
        
        # Verify Class
        class_names = [c["name"] for c in res["classes"]]
        self.assertIn("AppController", class_names)
        
        # Verify Method
        func_names = [f["name"] for f in res["functions"]]
        self.assertIn("index", func_names)
        
        # Verify Imports
        imports = [i["module"] for i in res["imports"]]
        self.assertIn("sinatra", imports)
        
        # Verify API endpoints
        apis = res["apis"]
        self.assertEqual(len(apis), 1)
        self.assertEqual(apis[0]["method"], "GET")
        self.assertEqual(apis[0]["path"], "/orders")

        # Verify DB queries
        queries = res["db_queries"]
        self.assertEqual(len(queries), 1)
        self.assertEqual(queries[0]["table"], "orders")
        self.assertEqual(queries[0]["operation"], "SELECT")


class TestPhpParser(unittest.TestCase):
    def setUp(self):
        self.parser = PhpParser()

    def test_parse_php_class(self):
        code = r"""
        <?php
        namespace App\Controllers;
        use App\Models\User;
        
        class UserController {
            public function show($id) {
                $query = "SELECT * FROM users WHERE id = " . $id;
                Route::get('/users/show', 'UserController@show');
            }
        }
        """
        res = self.parser.parse(code, "UserController.php")
        
        # Verify Class
        class_names = [c["name"] for c in res["classes"]]
        self.assertIn("UserController", class_names)
        
        # Verify Method
        func_names = [f["name"] for f in res["functions"]]
        self.assertIn("show", func_names)
        
        # Verify Imports
        imports = [i["module"] for i in res["imports"]]
        self.assertIn("App\\Models\\User", imports)
        
        # Verify API route
        apis = res["apis"]
        self.assertEqual(len(apis), 1)
        self.assertEqual(apis[0]["method"], "GET")
        self.assertEqual(apis[0]["path"], "/users/show")

        # Verify DB queries
        queries = res["db_queries"]
        self.assertEqual(len(queries), 1)
        self.assertEqual(queries[0]["table"], "users")
        self.assertEqual(queries[0]["operation"], "SELECT")


class TestTerraformParser(unittest.TestCase):
    def setUp(self):
        self.parser = TerraformParser()

    def test_parse_hcl_resource_and_module(self):
        code = r"""
        module "vpc" {
          source = "terraform-aws-modules/vpc/aws"
          name   = "my-vpc"
        }
        
        resource "aws_subnet" "main" {
          vpc_id     = module.vpc.vpc_id
          cidr_block = "10.0.1.0/24"
        }
        
        resource "aws_instance" "web" {
          ami           = "ami-123456"
          instance_type = "t2.micro"
          subnet_id     = aws_subnet.main.id
        }
        """
        res = self.parser.parse(code, "main.tf")
        
        # Verify Classes (Resource Blocks)
        class_names = [c["name"] for c in res["classes"]]
        self.assertIn("aws_subnet.main", class_names)
        self.assertIn("aws_instance.web", class_names)
        
        # Verify Imports (Modules)
        imports = [i["module"] for i in res["imports"]]
        self.assertIn("terraform-aws-modules/vpc/aws", imports)
        
        # Verify Calls (Resource Dependencies)
        calls = res["calls"]
        self.assertTrue(any(c["caller"] == "aws_subnet.main" and c["callee"] == "module.vpc" for c in calls))
        self.assertTrue(any(c["caller"] == "aws_instance.web" and c["callee"] == "aws_subnet.main" for c in calls))


if __name__ == "__main__":
    unittest.main()
