package com.misfat.userservice.controller;

import com.misfat.userservice.dto.UserRegistrationDto;
import com.misfat.userservice.entity.User;
import com.misfat.userservice.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /**
     * 1. Inscription publique (Sign Up)
     */
    @PostMapping("/signup")
    public ResponseEntity<?> signUp(@RequestBody UserRegistrationDto userDto) {
        try {
            User user = userService.registerPendingUser(userDto);
            return ResponseEntity.status(HttpStatus.CREATED).body(user);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * 2. Connexion (Sign In)
     */
    @PostMapping("/signin")
    public ResponseEntity<?> signIn(@RequestBody Map<String, String> loginRequest) {
        try {
            String username = loginRequest.get("username");
            Map<String, Object> response = userService.loginUser(username);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("validation")) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(e.getMessage());
            }
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * 3. Approbation par l'Administrateur (Espace Admin)
     * CORRECTION : Plus besoin de passer le password en paramètre URL !
     */
    @PutMapping("/{id}/approve")
    public ResponseEntity<String> approveUser(@PathVariable Long id) {
        try {
            String message = userService.approveUser(id);
            return ResponseEntity.ok(message);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(e.getMessage());
        }
    }

    /**
     * 4. Récupérer tous les utilisateurs (Pour Angular getUsers)
     */
    @GetMapping
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
    }
}