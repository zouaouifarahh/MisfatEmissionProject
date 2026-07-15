package com.misfat.userservice.dto;

import com.misfat.userservice.entity.Role;
import com.misfat.userservice.entity.Usine;
import lombok.Data;

@Data
public class UserRegistrationDto {
    private String username;
    private String email;
    private String password;
    private String firstName;
    private String lastName;
    private Role role; // Ex: "ADMIN", "USER", "MASTER_ADMIN"
    private Usine usine;
}