# Example: Edge Loop Segmentation
add_executable(example_edge_loop example_edge_loop.cpp)
target_link_libraries(example_edge_loop PRIVATE mesh_segmentation)

# Example: Curvature-based Segmentation
add_executable(example_curvature example_curvature.cpp)
target_link_libraries(example_curvature PRIVATE mesh_segmentation)

# Visualize seam lines (SVG output)
add_executable(visualize_seams visualize_seams.cpp)
target_link_libraries(visualize_seams PRIVATE mesh_segmentation)

# List seam lines (text output)
add_executable(list_seams list_seams.cpp)
target_link_libraries(list_seams PRIVATE mesh_segmentation)

# Quick segmentation test
add_executable(quick_seam_test quick_seam_test.cpp)
target_link_libraries(quick_seam_test PRIVATE mesh_segmentation)

# Performance benchmark
add_executable(perf_test perf_test.cpp)
target_link_libraries(perf_test PRIVATE igl::core)
