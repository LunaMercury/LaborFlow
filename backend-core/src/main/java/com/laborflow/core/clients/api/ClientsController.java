package com.laborflow.core.clients.api;

import com.laborflow.core.clients.application.ClientsService;
import com.laborflow.core.clients.dto.ClientListResponse;
import com.laborflow.core.clients.dto.CreateClientRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/clients")
public class ClientsController {
    private final ClientsService clientsService;

    public ClientsController(ClientsService clientsService) {
        this.clientsService = clientsService;
    }

    @GetMapping
    public ClientListResponse getClients(@RequestParam(defaultValue = "test") String loginId) {
        return clientsService.getClients(loginId);
    }

    @PostMapping
    public ClientListResponse createClient(
        @RequestParam(defaultValue = "test") String loginId,
        @RequestBody CreateClientRequest request
    ) {
        clientsService.createClient(loginId, request);
        return clientsService.getClients(loginId);
    }
}
