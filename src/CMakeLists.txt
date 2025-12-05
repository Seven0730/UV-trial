# Mesh Segmentation Library
set(SEGMENTATION_SOURCES
    edge_loop_segmentation.cpp
    curvature_segmentation.cpp
    advanced_segmentation.cpp
)

add_library(mesh_segmentation STATIC ${SEGMENTATION_SOURCES})

target_include_directories(mesh_segmentation PUBLIC
    ${CMAKE_SOURCE_DIR}/include
)

# Link libigl for mesh processing utilities
target_link_libraries(mesh_segmentation PUBLIC igl::core)

# Set C++17
target_compile_features(mesh_segmentation PUBLIC cxx_std_17)
