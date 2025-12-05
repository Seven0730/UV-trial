# Example: Edge Loop Segmentation
add_executable(example_edge_loop example_edge_loop.cpp)
target_link_libraries(example_edge_loop PRIVATE uv_unwrapping)

# Example: Curvature-based Segmentation
add_executable(example_curvature example_curvature.cpp)
target_link_libraries(example_curvature PRIVATE uv_unwrapping)

# Example: LSCM Unwrapping
add_executable(example_lscm example_lscm.cpp)
target_link_libraries(example_lscm PRIVATE uv_unwrapping)

# Example: ABF Unwrapping
add_executable(example_abf example_abf.cpp)
target_link_libraries(example_abf PRIVATE uv_unwrapping)

# Example: xatlas
if(USE_XATLAS)
    add_executable(example_xatlas example_xatlas.cpp)
    target_link_libraries(example_xatlas PRIVATE uv_unwrapping)
endif()

# Example: Complete Pipeline
add_executable(example_pipeline example_pipeline.cpp)
target_link_libraries(example_pipeline PRIVATE uv_unwrapping)

# Example: Generate UV Images (without GUI)
add_executable(generate_uv_images generate_uv_images.cpp)
target_link_libraries(generate_uv_images PRIVATE uv_unwrapping)
