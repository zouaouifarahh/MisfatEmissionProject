package com.misfat.dataimportservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

@SpringBootApplication
@EnableFeignClients
public class DataimportserviceApplication {

    public static void main(String[] args) {
        SpringApplication.run(DataimportserviceApplication.class, args);
    }

}
